import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { playerQueries, lobbyQueries, lobbyPlayerQueries, gameResultQueries, pushSubscriptionQueries, vapidKeys, playerGameQueries, playerStatQueries, globalStatQueries } from '../services/database'
import { lobbyManager } from '../services/lobbyManager'
import type { TurnMode, AiDifficulty, ActiveGameSummary, PlayerStats, GlobalStats } from '@ingenious/shared'
import db from '../services/database'

// Valid real-time turn timer presets (seconds). null = async/turn-based.
const VALID_TURN_LIMITS = new Set([30, 60, 120, 300])

export default async function apiRoutes(fastify: FastifyInstance) {
  // Get or create player from token (10 requests per minute per IP)
  fastify.post('/api/auth', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']

    if (token) {
      const player = playerQueries.findByToken.get(token)
      if (player) {
        return reply.send({ playerId: player.id, playerName: player.display_name })
      }
    }

    // Create new player
    const newToken = uuidv4()
    const playerId = uuidv4()
    const defaultName = `Player_${playerId.slice(0, 6)}`

    playerQueries.insert.run(playerId, defaultName, newToken)

    reply.setCookie('player_token', newToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })

    return reply.send({ playerId, playerName: defaultName })
  })

  // Update player name (20 requests per minute per IP)
  fastify.put('/api/player/name', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    const body = request.body as { name?: string }
    const name = body?.name?.trim()
    if (!name || name.length < 1 || name.length > 20) {
      return reply.status(400).send({ error: 'Name must be 1-20 characters' })
    }

    playerQueries.updateName.run(name, player.id)
    return reply.send({ playerName: name })
  })

  // Create lobby (5 per minute per IP to prevent spam)
  fastify.post('/api/lobbies', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    const body = request.body as {
      maxPlayers?: number
      turnMode?: string
      turnLimitSeconds?: number | null
      vsAI?: boolean
      aiDifficulty?: string
    }
    const vsAI = body?.vsAI === true
    const rawDifficulty = body?.aiDifficulty
    const aiDifficulty: AiDifficulty =
      rawDifficulty === 'easy' || rawDifficulty === 'medium' || rawDifficulty === 'hard'
        ? rawDifficulty
        : 'hard'
    const maxPlayers = vsAI ? 2 : Math.min(4, Math.max(2, body?.maxPlayers ?? 2))

    const rawMode = body?.turnMode ?? 'realtime'
    const turnMode: TurnMode = rawMode === 'async' ? 'async' : 'realtime'

    // vsAI games are always turn-based (async) with no timer so the player can
    // drop in and out freely — identical to async games with human opponents.
    const effectiveTurnMode: TurnMode = vsAI ? 'async' : turnMode

    let turnLimitSeconds: number | null
    if (effectiveTurnMode === 'async') {
      turnLimitSeconds = null
    } else {
      const requested = body?.turnLimitSeconds ?? 60
      turnLimitSeconds = VALID_TURN_LIMITS.has(requested) ? requested : 60
    }

    const lobby = lobbyManager.createLobby(maxPlayers, effectiveTurnMode, turnLimitSeconds, vsAI, aiDifficulty)

    return reply.send({ lobbyId: lobby.id, maxPlayers: lobby.maxPlayers, turnMode: effectiveTurnMode, turnLimitSeconds })
  })

  // Get lobby info (60 per minute per IP)
  fastify.get('/api/lobbies/:id', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const lobby = lobbyManager.getLobby(id)
    if (!lobby) return reply.status(404).send({ error: 'Lobby not found' })
    return reply.send(lobby.getLobbyState())
  })

  // ── Push Notification endpoints ──────────────────────────────────────────

  // Return the VAPID public key so clients can subscribe (20 req/min)
  fastify.get('/api/push/vapid-key', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (_request, reply) => {
    if (!vapidKeys.publicKey) {
      return reply.status(503).send({ error: 'Push notifications not configured' })
    }
    return reply.send({ publicKey: vapidKeys.publicKey })
  })

  // Save / update a player's push subscription (20 req/min)
  fastify.post('/api/push/subscribe', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    const body = request.body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    const endpoint = body?.endpoint
    const p256dh = body?.keys?.p256dh
    const auth = body?.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return reply.status(400).send({ error: 'Missing subscription fields' })
    }

    pushSubscriptionQueries.upsert.run(player.id, endpoint, p256dh, auth)
    return reply.send({ ok: true })
  })

  // Remove a player's push subscription (20 req/min)
  fastify.delete('/api/push/subscribe', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    pushSubscriptionQueries.delete.run(player.id)
    return reply.send({ ok: true })
  })

  // List active in-progress games the player is part of (30 per minute per IP)
  fastify.get('/api/player/games', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    const playerId = player.id
    const rows = playerGameQueries.findActiveForPlayer.all(playerId)

    const games: ActiveGameSummary[] = []
    for (const row of rows) {
      const lobby = lobbyManager.getLobby(row.lobby_id)
      if (!lobby?.gameRoom) continue

      const gameState = lobby.gameRoom.getState()
      games.push({
        lobbyId: row.lobby_id,
        turnMode: (row.turn_mode as TurnMode) || 'realtime',
        currentPlayerId: gameState.currentPlayerId,
        yourTurn: gameState.currentPlayerId === playerId,
        players: lobby.players.map(p => ({ id: p.id, name: p.name, seat: p.seat })),
      })
    }

    return reply.send({ games })
  })

  // Player statistics (30 per minute per IP)
  fastify.get('/api/player/stats', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)['player_token']
    if (!token) return reply.status(401).send({ error: 'Unauthorized' })

    const player = playerQueries.findByToken.get(token)
    if (!player) return reply.status(401).send({ error: 'Unauthorized' })

    const row = playerStatQueries.getForPlayer.get(player.id, player.id, player.id)
    const stats: PlayerStats = {
      gamesPlayed: row?.games_played ?? 0,
      gamesWon: row?.games_won ?? 0,
      uniqueOpponents: row?.unique_opponents ?? 0,
    }
    return reply.send({ stats })
  })

  // Global statistics — public (30 per minute per IP)
  fastify.get('/api/stats', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (_request, reply) => {
    const row = globalStatQueries.get.get()
    const stats: GlobalStats = {
      totalGames: row?.total_games ?? 0,
      realtimeGames: row?.realtime_games ?? 0,
      asyncGames: row?.async_games ?? 0,
      wonByAllEighteen: row?.won_by_all_eighteen ?? 0,
      wonByNoMoves: row?.won_by_no_moves ?? 0,
      wonByForfeit: row?.won_by_forfeit ?? 0,
    }
    return reply.send({ stats })
  })

  // Health check
  fastify.get('/health', async (_request, reply) => {
    try {
      db.prepare('SELECT 1').get()
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      })
    } catch {
      return reply.status(503).send({ status: 'error', message: 'Database unavailable' })
    }
  })

  // Game history (30 per minute per IP)
  fastify.get('/api/history', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (_request, reply) => {
    const rows = gameResultQueries.findRecent.all()
    const results = rows.map(r => {
      let scores: Record<string, Record<string, number>> = {}
      try {
        scores = JSON.parse(r.final_scores) as Record<string, Record<string, number>>
      } catch {
        // Malformed scores — return empty object rather than crashing
      }
      return {
        id: r.id,
        lobbyId: r.lobby_id,
        winnerId: r.winner_id,
        winnerName: r.winner_name,
        scores,
        moveCount: r.move_count,
        durationSeconds: r.duration_seconds,
        finishedAt: r.finished_at,
      }
    })
    return reply.send({ results })
  })
}
