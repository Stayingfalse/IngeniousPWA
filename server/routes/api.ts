import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { playerQueries, lobbyQueries, lobbyPlayerQueries, gameResultQueries } from '../services/database'
import { lobbyManager } from '../services/lobbyManager'
import db from '../services/database'

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

    const body = request.body as { maxPlayers?: number }
    const maxPlayers = Math.min(4, Math.max(2, body?.maxPlayers ?? 2))

    const lobby = lobbyManager.createLobby(maxPlayers)

    return reply.send({ lobbyId: lobby.id, maxPlayers: lobby.maxPlayers })
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
