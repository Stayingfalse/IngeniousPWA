import Fastify, { type FastifyReply } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import fastifyRateLimit from '@fastify/rate-limit'
import path from 'path'
import fs from 'fs'
import apiRoutes from './routes/api'
import websocketRoutes from './routes/websocket'
import { lobbyManager } from './services/lobbyManager'
import { buildOgMeta, buildDefaultOgMeta, renderOgTags } from './lib/ogEmbed'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist')
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
})

async function start() {
  await fastify.register(fastifyCookie)
  await fastify.register(fastifyWebsocket)

  // Rate limiting: protect REST API from abuse
  await fastify.register(fastifyRateLimit, {
    global: false, // apply per-route via config
  })

  // Register routes
  await fastify.register(apiRoutes)
  await fastify.register(websocketRoutes)

  // Serve static client files if dist exists
  if (fs.existsSync(CLIENT_DIST)) {
    // Cache index.html once at startup; it only changes on redeployment.
    const indexPath = path.join(CLIENT_DIST, 'index.html')
    const indexTemplate = fs.readFileSync(indexPath, 'utf-8')

    // Helper: build and inject OG tags into the index.html template.
    const serveIndexWithOgTags = (reqUrl: string, reply: FastifyReply) => {
      const qIdx = reqUrl.indexOf('?')
      const qs = qIdx >= 0 ? reqUrl.slice(qIdx + 1) : ''
      const params = new URLSearchParams(qs)
      const rawJoinCode = params.get('join') ?? ''

      // Also accept the lobby code as a clean path segment: /ELCCQP
      const pathname = reqUrl.split('?')[0]
      const pathCode = /^\/([A-Z0-9]{6})$/i.exec(pathname)?.[1] ?? ''

      // Lobby codes are exactly 6 uppercase alphanumeric characters; skip DB
      // lookups for anything that doesn't match this shape.
      const joinCode = /^[A-Z0-9]{6}$/i.test(rawJoinCode)
        ? rawJoinCode
        : /^[A-Z0-9]{6}$/i.test(pathCode)
          ? pathCode
          : ''

      const pageUrl = PUBLIC_URL + reqUrl

      const meta = joinCode
        ? buildOgMeta(joinCode, PUBLIC_URL)
        : buildDefaultOgMeta(PUBLIC_URL)

      const ogTags = renderOgTags(meta, pageUrl)
      // Inject immediately before </head>
      const html = indexTemplate.replace('</head>', `    ${ogTags}\n  </head>`)

      reply.type('text/html').send(html)
    }

    // Explicit GET / handler registered BEFORE fastifyStatic so that
    // social-media crawlers (Discord, Slack, etc.) hitting /?join=CODE
    // receive rich OG embeds. fastifyStatic would serve the static
    // index.html directly, bypassing OG injection entirely.
    fastify.get('/', (request, reply) => {
      serveIndexWithOgTags(request.url ?? '/', reply)
    })

    await fastify.register(fastifyStatic, {
      root: CLIENT_DIST,
      prefix: '/',
    })

    // SPA fallback for deep-link paths (e.g. /some-path): inject OG tags.
    fastify.setNotFoundHandler((request, reply) => {
      serveIndexWithOgTags(request.url ?? '/', reply)
    })
  }

  try {
    await fastify.listen({ port: PORT, host: HOST })
    console.log(`Server running at http://${HOST}:${PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()

// Graceful shutdown: flush all in-progress game snapshots before exit so
// minimal state is lost between server restarts.
const handleShutdown = () => {
  try {
    lobbyManager.flushAllSnapshots()
  } catch {
    // Best-effort
  }
  process.exit(0)
}

process.on('SIGTERM', handleShutdown)
process.on('SIGINT', handleShutdown)
