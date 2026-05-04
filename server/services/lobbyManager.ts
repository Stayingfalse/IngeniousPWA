import { WebSocket } from '@fastify/websocket'
import type { PlayerInfo, LobbyState, ServerMessage, TurnMode, AiDifficulty, GameState, SpectatorInfo } from '@ingenious/shared'
import { GameRoom } from './gameRoom'
import type { GameRoomSnapshot } from './gameRoom'
import { lobbyQueries, lobbyPlayerQueries, snapshotQueries, playerQueries } from './database'
import { AI_PLAYER_ID, AI_PLAYER_NAME } from './aiPlayer'
import { v4 as uuidv4 } from 'uuid'

export interface LobbyPlayer {
  id: string
  name: string
  seat: number
  isAI?: boolean
}

export class Lobby {
  id: string
  status: 'waiting' | 'in_progress' | 'finished' = 'waiting'
  players: LobbyPlayer[] = []
  spectators: SpectatorInfo[] = []
  maxPlayers: number
  hostId: string | null = null
  connections: Map<string, WebSocket> = new Map()
  gameRoom: GameRoom | null = null
  createdAt: number = Date.now()
  turnMode: TurnMode
  turnLimitSeconds: number | null
  vsAI: boolean = false
  aiDifficulty: AiDifficulty = 'hard'
  autoStart: boolean = false
  tournamentId?: string
  matchId?: string

  constructor(id: string, maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null) {
    this.id = id
    this.maxPlayers = maxPlayers
    this.turnMode = turnMode
    this.turnLimitSeconds = turnLimitSeconds
  }

  getLobbyState(): LobbyState {
    return {
      id: this.id,
      status: this.status,
      players: this.players.map(p => ({ id: p.id, name: p.name, seat: p.seat, isAI: p.isAI })),
      maxPlayers: this.maxPlayers,
      hostId: this.hostId ?? '',
      turnMode: this.turnMode,
      turnLimitSeconds: this.turnLimitSeconds,
      spectators: [...this.spectators],
      autoStart: this.autoStart,
      tournamentId: this.tournamentId,
      matchId: this.matchId,
    }
  }

  send(playerId: string, msg: ServerMessage): void {
    const ws = this.connections.get(playerId)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }

  broadcast(msg: ServerMessage, excludeId?: string): void {
    for (const [pid, ws] of this.connections) {
      if (pid !== excludeId && ws.readyState === 1) {
        ws.send(JSON.stringify(msg))
      }
    }
  }

  /**
   * Silently remove a player's WebSocket connection without broadcasting
   * PLAYER_LEFT. Used when switching between async games so the player
   * remains a participant in this game.
   */
  detachConnection(playerId: string): void {
    this.connections.delete(playerId)
    if (this.gameRoom) {
      this.gameRoom.removeConnection(playerId)
    }
  }
}

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map()

  constructor() {
    this.restoreFromDatabase()
    this.restoreWaitingLobbies()
    // Periodically clean up stale lobbies to prevent memory leaks
    setInterval(() => this.cleanupLobbies(), 10 * 60 * 1000)
    // Periodically snapshot all in-progress games (safety net)
    setInterval(() => this.flushAllSnapshots(), 60 * 1000)
  }

  createLobby(maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null, vsAI = false, aiDifficulty: AiDifficulty = 'hard', autoStart = false): Lobby {
    const id = this.generateLobbyCode()
    const lobby = new Lobby(id, maxPlayers, turnMode, turnLimitSeconds)
    lobby.vsAI = vsAI
    lobby.aiDifficulty = aiDifficulty
    lobby.autoStart = autoStart
    this.lobbies.set(id, lobby)

    try {
      lobbyQueries.insert.run(id, 'waiting', maxPlayers, null, turnMode, turnLimitSeconds, autoStart ? 1 : 0)
    } catch {
      // Non-critical
    }

    return lobby
  }

  getLobby(id: string): Lobby | undefined {
    return this.lobbies.get(id.toUpperCase())
  }

  joinLobby(
    lobbyId: string,
    playerId: string,
    playerName: string,
    ws: WebSocket,
  ): { lobby: Lobby; seat: number } | { lobby: Lobby; isSpectator: true } | { error: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) {
      return { error: 'LOBBY_NOT_FOUND' }
    }
    if (lobby.status !== 'waiting') {
      // Allow reconnect if player is already in lobby
      const existing = lobby.players.find(p => p.id === playerId)
      if (!existing) {
        // Non-player visiting an in-progress game → admit as spectator
        if (lobby.status === 'in_progress' && lobby.gameRoom) {
          return { lobby, isSpectator: true }
        }
        return { error: 'GAME_ALREADY_STARTED' }
      }
    }

    // Check if player already in lobby (reconnect)
    const existing = lobby.players.find(p => p.id === playerId)
    if (existing) {
      lobby.connections.set(playerId, ws)
      return { lobby, seat: existing.seat }
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      return { error: 'LOBBY_FULL' }
    }

    const seat = lobby.players.length
    lobby.players.push({ id: playerId, name: playerName, seat })
    lobby.connections.set(playerId, ws)

    if (!lobby.hostId) {
      lobby.hostId = playerId
    }

    try {
      lobbyPlayerQueries.insert.run(lobbyId, playerId, seat)
    } catch {
      // Non-critical
    }

    // For vsAI lobbies, auto-add the computer player after the human joins
    if (lobby.vsAI && !lobby.players.some(p => p.id === AI_PLAYER_ID)) {
      const aiSeat = lobby.players.length
      lobby.players.push({ id: AI_PLAYER_ID, name: AI_PLAYER_NAME, seat: aiSeat, isAI: true })
      try {
        lobbyPlayerQueries.insert.run(lobbyId, AI_PLAYER_ID, aiSeat)
      } catch {
        // Non-critical
      }
    }

    return { lobby, seat }
  }

  startGame(lobbyId: string, requestingPlayerId: string, force = false): { error?: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    if (!force && lobby.hostId !== requestingPlayerId) return { error: 'NOT_HOST' }
    if (lobby.status !== 'waiting') return { error: 'ALREADY_STARTED' }
    if (lobby.players.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' }

    const playerIds = lobby.players.map(p => p.id)
    const playerNames: Record<string, string> = {}
    for (const p of lobby.players) {
      playerNames[p.id] = p.name
    }

    const turnLimitMs = lobby.turnLimitSeconds !== null ? lobby.turnLimitSeconds * 1000 : null
    const aiPlayerIds = new Set(lobby.players.filter(p => p.isAI).map(p => p.id))
    const gameRoom = new GameRoom(lobbyId, playerIds, playerNames, turnLimitMs, aiPlayerIds, lobby.aiDifficulty)
    gameRoom.onAfterMove = () => this.saveSnapshot(lobbyId)

    lobby.gameRoom = gameRoom
    lobby.status = 'in_progress'

    // Register connections with game room (AI players have no WebSocket)
    for (const player of lobby.players) {
      const ws = lobby.connections.get(player.id)
      if (ws) {
        gameRoom.addConnection(player.id, ws)
      }
    }

    try {
      lobbyQueries.setStarted.run('in_progress', lobbyId)
    } catch {
      // Non-critical
    }

    // Send game started to each human player with their masked state
    for (const player of lobby.players) {
      const masked = gameRoom.getMaskedState(player.id)
      lobby.send(player.id, { type: 'GAME_STARTED', state: masked })
    }

    // If the first player is AI, schedule the opening move
    gameRoom.scheduleAiMoveIfNeeded()

    return {}
  }

  deleteLobby(lobbyId: string, requestingPlayerId: string): { error?: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    if (lobby.hostId !== requestingPlayerId) return { error: 'NOT_HOST' }
    if (lobby.status !== 'waiting') return { error: 'GAME_ALREADY_STARTED' }

    // Notify all connected players that the lobby is closing
    lobby.broadcast({ type: 'LOBBY_CLOSED' })

    // Clean up DB
    try {
      lobbyPlayerQueries.deleteByLobby.run(lobbyId)
      lobbyQueries.delete.run(lobbyId)
    } catch {
      // Non-critical
    }

    this.lobbies.delete(lobbyId)
    return {}
  }

  setAutoStart(lobbyId: string, requestingPlayerId: string, enabled: boolean): { error?: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    if (lobby.hostId !== requestingPlayerId) return { error: 'NOT_HOST' }
    if (lobby.status !== 'waiting') return { error: 'GAME_ALREADY_STARTED' }

    lobby.autoStart = enabled

    try {
      lobbyQueries.updateAutoStart.run(enabled ? 1 : 0, lobbyId)
    } catch {
      // Non-critical
    }

    // Broadcast updated lobby state to all members
    lobby.broadcast({ type: 'LOBBY_STATE_UPDATED', lobbyState: lobby.getLobbyState() })
    return {}
  }

  kickPlayer(lobbyId: string, hostId: string, targetPlayerId: string): { error?: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    if (lobby.hostId !== hostId) return { error: 'NOT_HOST' }
    if (targetPlayerId === hostId) return { error: 'CANNOT_KICK_SELF' }

    const target = lobby.players.find(p => p.id === targetPlayerId)
    if (!target) return { error: 'PLAYER_NOT_FOUND' }
    if (target.isAI) return { error: 'CANNOT_KICK_AI' }

    // Notify the kicked player
    lobby.send(targetPlayerId, { type: 'PLAYER_KICKED' })

    if (lobby.status === 'waiting') {
      // Remove from player list and DB
      lobby.players = lobby.players.filter(p => p.id !== targetPlayerId)
      lobby.connections.delete(targetPlayerId)

      try {
        lobbyPlayerQueries.delete.run(lobbyId, targetPlayerId)
      } catch {
        // Non-critical
      }

      // Notify remaining members
      lobby.broadcast({ type: 'PLAYER_LEFT', playerId: targetPlayerId })
    } else if (lobby.status === 'in_progress' && lobby.gameRoom) {
      // Forfeit on behalf of the kicked player
      lobby.gameRoom.handleForfeit(targetPlayerId)
      // Remove the connection so the kicked player stops receiving updates
      lobby.connections.delete(targetPlayerId)
      lobby.gameRoom.removeConnection(targetPlayerId)
    }

    return {}
  }

  createTournamentLobby(maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null, tournamentId: string, matchId: string): Lobby {
    const lobby = this.createLobby(maxPlayers, turnMode, turnLimitSeconds)
    lobby.tournamentId = tournamentId
    lobby.matchId = matchId
    return lobby
  }

  joinTournamentLobby(lobbyId: string, playerId: string, playerName: string, ws: WebSocket): void {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return
    const existing = lobby.players.find(p => p.id === playerId)
    if (!existing) {
      const seat = lobby.players.length
      lobby.players.push({ id: playerId, name: playerName, seat })
      if (!lobby.hostId) lobby.hostId = playerId
      try {
        lobbyPlayerQueries.insert.run(lobbyId, playerId, seat)
      } catch { /* non-critical */ }
    }
    lobby.connections.set(playerId, ws)
  }

  startTournamentGame(lobbyId: string, playerNames: Record<string, string>): void {
    const lobby = this.getLobby(lobbyId)
    if (!lobby || lobby.status !== 'waiting') return

    const playerIds = lobby.players.map(p => p.id)
    const names: Record<string, string> = {}
    for (const p of lobby.players) {
      names[p.id] = playerNames[p.id] ?? p.name
    }

    const turnLimitMs = lobby.turnLimitSeconds !== null ? lobby.turnLimitSeconds * 1000 : null
    const gameRoom = new GameRoom(lobbyId, playerIds, names, turnLimitMs, new Set(), 'hard')
    gameRoom.onAfterMove = () => this.saveSnapshot(lobbyId)

    if (lobby.tournamentId) {
      const tid = lobby.tournamentId
      gameRoom.onGameOver = (results) => {
        import('./tournamentManager').then(({ tournamentManager }) => {
          tournamentManager.onGameFinished(lobbyId, results)
        }).catch(() => {})
      }
    }

    lobby.gameRoom = gameRoom
    lobby.status = 'in_progress'

    for (const player of lobby.players) {
      const ws = lobby.connections.get(player.id)
      if (ws) gameRoom.addConnection(player.id, ws)
    }

    try {
      lobbyQueries.setStarted.run('in_progress', lobbyId)
    } catch { /* non-critical */ }

    for (const player of lobby.players) {
      const masked = gameRoom.getMaskedState(player.id)
      lobby.send(player.id, { type: 'GAME_STARTED', state: masked })
    }
  }

  playerDisconnected(lobbyId: string, playerId: string): void {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return

    lobby.connections.delete(playerId)
    if (lobby.gameRoom) {
      lobby.gameRoom.removeConnection(playerId)
    }

    // Don't broadcast PLAYER_LEFT for async games (in_progress or waiting) — players
    // being offline is expected and the game/lobby continues when they return.
    if (!(lobby.turnMode === 'async' && (lobby.status === 'in_progress' || lobby.status === 'waiting'))) {
      lobby.broadcast({ type: 'PLAYER_LEFT', playerId })
    }
  }

  /**
   * Persist a snapshot of the given lobby's game state to the database so the
   * game can be restored after a server restart.
   */
  saveSnapshot(lobbyId: string): void {
    const lobby = this.getLobby(lobbyId)
    if (!lobby?.gameRoom || lobby.status !== 'in_progress') return

    try {
      const snapshot = lobby.gameRoom.getSnapshotData()
      snapshotQueries.upsert.run(
        lobbyId,
        JSON.stringify(snapshot.state),
        JSON.stringify({
          playerNames: snapshot.playerNames,
          turnLimitMs: snapshot.turnLimitMs,
          pendingSwapPlayerId: snapshot.pendingSwapPlayerId,
        }),
      )
    } catch (err) {
      console.error(`[LobbyManager] Failed to save snapshot for ${lobbyId}:`, err)
    }
  }

  /**
   * Flush snapshots for all in-progress games. Called before process exit to
   * minimise the number of moves lost on restart, and also on the periodic
   * snapshot interval.
   */
  flushAllSnapshots(): void {
    for (const [id, lobby] of this.lobbies) {
      if (lobby.status === 'in_progress' && lobby.gameRoom) {
        this.saveSnapshot(id)
      }
    }
  }

  /**
   * Restore in-progress async and realtime games from the database on startup.
   * Each snapshot is reconstructed into a Lobby + GameRoom without any active
   * WebSocket connections (players will reconnect on their next visit).
   */
  private restoreFromDatabase(): void {
    try {
      const snapshots = snapshotQueries.findAll.all()
      let restored = 0

      for (const snap of snapshots) {
        try {
          const state = JSON.parse(snap.state_json) as GameState
          const meta = JSON.parse(snap.player_names_json) as {
            playerNames: Record<string, string>
            turnLimitMs: number | null
            pendingSwapPlayerId: string | null
          }

          const lobbyRow = lobbyQueries.findById.get(snap.lobby_id)
          if (!lobbyRow) continue

          const dbPlayers = lobbyPlayerQueries.findByLobby.all(snap.lobby_id)
          if (dbPlayers.length === 0) continue

          // Build player list — prefer DB display names as the source of truth
          const playerNames: Record<string, string> = { ...meta.playerNames }
          const players: LobbyPlayer[] = []

          for (const lp of dbPlayers) {
            const playerRow = playerQueries.findById.get(lp.player_id)
            const name =
              playerRow?.display_name ||
              meta.playerNames[lp.player_id] ||
              `Player_${lp.player_id.slice(0, 6)}`
            playerNames[lp.player_id] = name
            players.push({ id: lp.player_id, seat: lp.seat_index, name, isAI: lp.player_id === AI_PLAYER_ID })
          }

          const turnMode = ((lobbyRow.turn_mode as TurnMode | null) || 'realtime') as TurnMode
          const turnLimitSeconds = lobbyRow.turn_limit_seconds ?? null

          const lobby = new Lobby(snap.lobby_id, lobbyRow.player_count, turnMode, turnLimitSeconds)
          lobby.players = players
          lobby.status = 'in_progress'
          lobby.hostId = players[0]?.id ?? null
          // Preserve original creation time (DB stores unix seconds)
          lobby.createdAt = (lobbyRow.created_at || Math.floor(Date.now() / 1000)) * 1000
          lobby.vsAI = players.some(p => p.id === AI_PLAYER_ID)

          const gameRoom = GameRoom.fromSnapshot(snap.lobby_id, {
            state,
            playerNames,
            turnLimitMs: meta.turnLimitMs,
            pendingSwapPlayerId: meta.pendingSwapPlayerId,
          })
          gameRoom.onAfterMove = () => this.saveSnapshot(snap.lobby_id)

          lobby.gameRoom = gameRoom
          this.lobbies.set(snap.lobby_id, lobby)
          // Re-schedule AI move if it was AI's turn when the server restarted
          gameRoom.scheduleAiMoveIfNeeded()
          restored++
        } catch (err) {
          console.error(`[LobbyManager] Failed to restore snapshot for ${snap.lobby_id}:`, err)
        }
      }

      if (restored > 0) {
        console.log(`[LobbyManager] Restored ${restored} in-progress game(s) from database`)
      }
    } catch (err) {
      console.error('[LobbyManager] Failed to restore from database:', err)
    }
  }

  private generateLobbyCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code: string
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    } while (this.lobbies.has(code))
    return code
  }

  private cleanupLobbies(): void {
    const now = Date.now()
    const ONE_HOUR = 60 * 60 * 1000
    const ONE_DAY = 24 * ONE_HOUR
    const SEVEN_DAYS = 7 * ONE_DAY
    const THIRTY_DAYS = 30 * ONE_DAY

    for (const [id, lobby] of this.lobbies) {
      const age = now - lobby.createdAt
      const idle = lobby.connections.size === 0
      const isAsync = lobby.turnMode === 'async'

      const shouldRemove =
        lobby.status === 'finished' ||
        // async waiting lobbies persist for 7 days even when idle
        (lobby.status === 'waiting' && isAsync && idle && age > SEVEN_DAYS) ||
        // realtime waiting lobbies expire after 1 hour idle
        (lobby.status === 'waiting' && !isAsync && idle && age > ONE_HOUR) ||
        // async in-progress games can be idle for up to 30 days
        (lobby.status === 'in_progress' && isAsync && idle && age > THIRTY_DAYS) ||
        // realtime in-progress games expire after 24h idle
        (lobby.status === 'in_progress' && !isAsync && idle && age > ONE_DAY)

      if (shouldRemove) {
        this.lobbies.delete(id)
      }
    }
  }

  /**
   * Restore async lobbies still in 'waiting' status from the database.
   * Called on startup so that players can return to open lobbies across restarts.
   */
  private restoreWaitingLobbies(): void {
    try {
      const waitingRows = lobbyQueries.findWaitingAsync.all()
      let restored = 0

      for (const row of waitingRows) {
        // Skip if this lobby is already loaded in memory (e.g. from restoreFromDatabase)
        if (this.lobbies.has(row.id)) continue

        const dbPlayers = lobbyPlayerQueries.findByLobby.all(row.id)
        if (dbPlayers.length === 0) continue

        const turnMode: TurnMode = 'async'
        const lobby = new Lobby(row.id, row.player_count, turnMode, row.turn_limit_seconds ?? null)
        lobby.status = 'waiting'
        lobby.autoStart = row.auto_start === 1
        lobby.createdAt = (row.created_at || Math.floor(Date.now() / 1000)) * 1000

        const players: LobbyPlayer[] = []
        for (const lp of dbPlayers) {
          const playerRow = playerQueries.findById.get(lp.player_id)
          const name = playerRow?.display_name ?? `Player_${lp.player_id.slice(0, 6)}`
          players.push({ id: lp.player_id, seat: lp.seat_index, name, isAI: lp.player_id === AI_PLAYER_ID })
        }

        lobby.players = players
        lobby.hostId = row.host_id ?? players[0]?.id ?? null

        this.lobbies.set(row.id, lobby)
        restored++
      }

      if (restored > 0) {
        console.log(`[LobbyManager] Restored ${restored} waiting async lobby(ies) from database`)
      }
    } catch (err) {
      console.error('[LobbyManager] Failed to restore waiting lobbies:', err)
    }
  }
}

export const lobbyManager = new LobbyManager()
