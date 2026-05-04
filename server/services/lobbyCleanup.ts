import type { Lobby } from './lobbyManager'

export function shouldRemoveLobby(lobby: Lobby, now: number): boolean {
  const ONE_HOUR = 60 * 60 * 1000
  const ONE_DAY = 24 * ONE_HOUR
  const SEVEN_DAYS = 7 * ONE_DAY
  const THIRTY_DAYS = 30 * ONE_DAY

  const age = now - lobby.createdAt
  const idle = lobby.connections.size === 0
  const isAsync = lobby.turnMode === 'async'

  return (
    lobby.status === 'finished' ||
    // async waiting lobbies persist for 7 days even when idle
    (lobby.status === 'waiting' && isAsync && idle && age > SEVEN_DAYS) ||
    // realtime waiting lobbies expire after 1 hour idle
    (lobby.status === 'waiting' && !isAsync && idle && age > ONE_HOUR) ||
    // async in-progress games can be idle for up to 30 days
    (lobby.status === 'in_progress' && isAsync && idle && age > THIRTY_DAYS) ||
    // realtime in-progress games expire after 24h idle
    (lobby.status === 'in_progress' && !isAsync && idle && age > ONE_DAY)
  )
}

