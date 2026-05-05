import Fastify from 'fastify'
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
    await fastify.register(fastifyStatic, {
      root: CLIENT_DIST,
      prefix: '/',
    })

    // SPA fallback — inject OG meta tags when a ?join= code is present so that
    // social-media crawlers (Discord, Slack, Twitter, etc.) receive rich embeds.
    fastify.setNotFoundHandler((request, reply) => {
      const indexPath = path.join(CLIENT_DIST, 'index.html')
      let html = fs.readFileSync(indexPath, 'utf-8')

      const reqUrl = request.url ?? '/'
      const qIdx = reqUrl.indexOf('?')
      const qs = qIdx >= 0 ? reqUrl.slice(qIdx + 1) : ''
      const params = new URLSearchParams(qs)
      const joinCode = params.get('join')

      const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
      const pageUrl = PUBLIC_URL + reqUrl

      const meta = joinCode
        ? buildOgMeta(joinCode, PUBLIC_URL)
        : buildDefaultOgMeta(PUBLIC_URL)

      const ogTags = renderOgTags(meta, pageUrl)
      // Inject immediately before </head> so they override any static defaults
      html = html.replace('</head>', `    ${ogTags}\n  </head>`)

      reply.type('text/html').send(html)
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
