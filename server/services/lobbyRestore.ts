import type { TurnMode, GameState } from '@ingenious/shared'
import { GameRoom } from './gameRoom'
import { lobbyQueries, lobbyPlayerQueries, playerQueries, snapshotQueries } from './database'
import type { Lobby, LobbyPlayer } from './lobbyManager'
import { AI_PLAYER_ID } from './aiPlayer'

export function restoreInProgressLobbiesFromDatabase(createLobby: (id: string, maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null) => Lobby): Lobby[] {
  const restoredLobbies: Lobby[] = []

  const snapshots = snapshotQueries.findAll.all()
  for (const snap of snapshots) {
    const lobby = restoreInProgressLobbyFromSnapshot(
      snap,
      createLobby,
    )
    if (lobby) restoredLobbies.push(lobby)
  }

  return restoredLobbies
}

function restoreInProgressLobbyFromSnapshot(
  snap: { lobby_id: string; state_json: string; player_names_json: string },
  createLobby: (id: string, maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null) => Lobby,
): Lobby | null {
  try {
    const state = JSON.parse(snap.state_json) as GameState
    const meta = JSON.parse(snap.player_names_json) as {
      playerNames: Record<string, string>
      turnLimitMs: number | null
      pendingSwapPlayerId: string | null
    }

    const lobbyRow = lobbyQueries.findById.get(snap.lobby_id)
    if (!lobbyRow) return null

    const dbPlayers = lobbyPlayerQueries.findByLobby.all(snap.lobby_id)
    if (dbPlayers.length === 0) return null

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

    const lobby = createLobby(snap.lobby_id, lobbyRow.player_count, turnMode, turnLimitSeconds)
    lobby.players = players
    lobby.status = 'in_progress'
    lobby.hostId = players[0]?.id ?? null
    lobby.createdAt = (lobbyRow.created_at || Math.floor(Date.now() / 1000)) * 1000
    lobby.vsAI = players.some(p => p.id === AI_PLAYER_ID)

    const gameRoom = GameRoom.fromSnapshot(snap.lobby_id, {
      state,
      playerNames,
      turnLimitMs: meta.turnLimitMs,
      pendingSwapPlayerId: meta.pendingSwapPlayerId,
    })
    gameRoom.onAfterMove = () => {
      // LobbyManager attaches its real saveSnapshot handler.
    }
    lobby.gameRoom = gameRoom
    gameRoom.scheduleAiMoveIfNeeded()

    return lobby
  } catch (err) {
    console.error(`[LobbyManager] Failed to restore snapshot for ${snap.lobby_id}:`, err)
    return null
  }
}

export function restoreWaitingAsyncLobbiesFromDatabase(createLobby: (id: string, maxPlayers: number, turnMode: TurnMode, turnLimitSeconds: number | null) => Lobby): Lobby[] {
  const restored: Lobby[] = []
  const waitingRows = lobbyQueries.findWaitingAsync.all()

  for (const row of waitingRows) {
    const dbPlayers = lobbyPlayerQueries.findByLobby.all(row.id)
    if (dbPlayers.length === 0) continue

    const turnMode: TurnMode = 'async'
    const lobby = createLobby(row.id, row.player_count, turnMode, row.turn_limit_seconds ?? null)
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
    restored.push(lobby)
  }

  return restored
}

