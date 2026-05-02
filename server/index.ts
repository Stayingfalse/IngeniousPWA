import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import fastifyRateLimit from '@fastify/rate-limit'
import path from 'path'
import fs from 'fs'
import apiRoutes from './routes/api'
import websocketRoutes from './routes/websocket'

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

    // SPA fallback
    fastify.setNotFoundHandler((_, reply) => {
      reply.sendFile('index.html')
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
