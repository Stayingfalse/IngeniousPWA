import { WebSocket } from '@fastify/websocket'
import type { PlayerInfo, LobbyState, ServerMessage } from '@ingenious/shared'
import { GameRoom } from './gameRoom'
import { lobbyQueries, lobbyPlayerQueries } from './database'
import { v4 as uuidv4 } from 'uuid'

export interface LobbyPlayer {
  id: string
  name: string
  seat: number
}

export class Lobby {
  id: string
  status: 'waiting' | 'in_progress' | 'finished' = 'waiting'
  players: LobbyPlayer[] = []
  maxPlayers: number
  hostId: string | null = null
  connections: Map<string, WebSocket> = new Map()
  gameRoom: GameRoom | null = null
  createdAt: number = Date.now()

  constructor(id: string, maxPlayers: number) {
    this.id = id
    this.maxPlayers = maxPlayers
  }

  getLobbyState(): LobbyState {
    return {
      id: this.id,
      status: this.status,
      players: this.players.map(p => ({ id: p.id, name: p.name, seat: p.seat })),
      maxPlayers: this.maxPlayers,
      hostId: this.hostId ?? '',
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
}

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map()

  constructor() {
    // Periodically clean up stale lobbies to prevent memory leaks
    setInterval(() => this.cleanupLobbies(), 10 * 60 * 1000)
  }

  createLobby(maxPlayers: number): Lobby {
    const id = this.generateLobbyCode()
    const lobby = new Lobby(id, maxPlayers)
    this.lobbies.set(id, lobby)

    try {
      lobbyQueries.insert.run(id, 'waiting', maxPlayers, null)
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
  ): { lobby: Lobby; seat: number } | { error: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) {
      return { error: 'LOBBY_NOT_FOUND' }
    }
    if (lobby.status !== 'waiting') {
      // Allow reconnect if player is already in lobby
      const existing = lobby.players.find(p => p.id === playerId)
      if (!existing) {
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

    return { lobby, seat }
  }

  startGame(lobbyId: string, requestingPlayerId: string): { error?: string } {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    if (lobby.hostId !== requestingPlayerId) return { error: 'NOT_HOST' }
    if (lobby.status !== 'waiting') return { error: 'ALREADY_STARTED' }
    if (lobby.players.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' }

    const playerIds = lobby.players.map(p => p.id)
    const gameRoom = new GameRoom(lobbyId, playerIds)

    lobby.gameRoom = gameRoom
    lobby.status = 'in_progress'

    // Register connections with game room
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

    // Send game started to each player with their masked state
    for (const player of lobby.players) {
      const masked = gameRoom.getMaskedState(player.id)
      lobby.send(player.id, { type: 'GAME_STARTED', state: masked })
    }

    return {}
  }

  playerDisconnected(lobbyId: string, playerId: string): void {
    const lobby = this.getLobby(lobbyId)
    if (!lobby) return

    lobby.connections.delete(playerId)
    if (lobby.gameRoom) {
      lobby.gameRoom.removeConnection(playerId)
    }

    lobby.broadcast({ type: 'PLAYER_LEFT', playerId })
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

    for (const [id, lobby] of this.lobbies) {
      const age = now - lobby.createdAt
      const idle = lobby.connections.size === 0

      const shouldRemove =
        lobby.status === 'finished' ||
        (lobby.status === 'waiting' && idle && age > ONE_HOUR) ||
        (lobby.status === 'in_progress' && idle && age > ONE_DAY)

      if (shouldRemove) {
        this.lobbies.delete(id)
      }
    }
  }
}

export const lobbyManager = new LobbyManager()
