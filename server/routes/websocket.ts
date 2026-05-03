import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import type { ClientMessage } from '@ingenious/shared'
import { playerQueries } from '../services/database'
import { lobbyManager } from '../services/lobbyManager'
import { v4 as uuidv4 } from 'uuid'

export default async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    let playerId: string | null = null
    let currentLobbyId: string | null = null

    const send = (msg: object) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg))
      }
    }

    socket.on('message', (rawData: Buffer | string) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(rawData.toString()) as ClientMessage
      } catch {
        send({ type: 'ERROR', code: 'INVALID_JSON', message: 'Invalid JSON' })
        return
      }

      switch (msg.type) {
        case 'PING':
          send({ type: 'PONG' })
          break

        case 'JOIN_LOBBY': {
          const { lobbyId, playerName } = msg

          // Identify or create player from cookie
          const token = extractToken(request.headers.cookie)
          let pid = playerId

          if (!pid) {
            if (token) {
              const player = playerQueries.findByToken.get(token)
              if (player) {
                pid = player.id
                playerQueries.updateName.run(playerName.trim() || player.display_name, pid)
              }
            }
            if (!pid) {
              // Create anonymous player
              pid = uuidv4()
              const newToken = uuidv4()
              const name = playerName.trim() || `Player_${pid.slice(0, 6)}`
              playerQueries.insert.run(pid, name, newToken)
            }
            playerId = pid
          }

          currentLobbyId = lobbyId.toUpperCase()
          const result = lobbyManager.joinLobby(currentLobbyId, pid, playerName, socket)

          if ('error' in result) {
            send({ type: 'ERROR', code: result.error, message: result.error })
            return
          }

          const { lobby, seat } = result

          send({
            type: 'JOINED',
            playerId: pid,
            seat,
            lobbyState: lobby.getLobbyState(),
          })

          // Notify others
          const playerInfo = { id: pid, name: playerName, seat }
          lobby.broadcast({ type: 'PLAYER_JOINED', player: playerInfo }, pid)

          // If game is in progress, send current state
          if (lobby.gameRoom && lobby.status === 'in_progress') {
            lobby.gameRoom.addConnection(pid, socket)
            const masked = lobby.gameRoom.getMaskedState(pid)
            send({ type: 'STATE_UPDATE', state: masked })
          }
          break
        }

        case 'START_GAME': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const startResult = lobbyManager.startGame(currentLobbyId, playerId)
          if (startResult.error) {
            send({ type: 'ERROR', code: startResult.error, message: startResult.error })
          }
          break
        }

        case 'PLACE_TILE': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            send({ type: 'ERROR', code: 'NO_GAME', message: 'No active game' })
            return
          }

          lobby.gameRoom.handlePlaceTile(playerId, msg.tileIndex, msg.hexA, msg.hexB)
          break
        }

        case 'SWAP_RACK': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            send({ type: 'ERROR', code: 'NO_GAME', message: 'No active game' })
            return
          }

          lobby.gameRoom.handleSwapRack(playerId)
          break
        }

        case 'DECLINE_SWAP': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            send({ type: 'ERROR', code: 'NO_GAME', message: 'No active game' })
            return
          }

          lobby.gameRoom.handleDeclineSwap(playerId)
          break
        }

        case 'CHANGE_NAME': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const name = msg.name?.trim()
          if (!name || name.length < 1 || name.length > 20) {
            send({ type: 'ERROR', code: 'INVALID_NAME', message: 'Name must be 1-20 characters' })
            return
          }

          // Update DB
          playerQueries.updateName.run(name, playerId)

          // Update in-memory lobby player name
          const nameLobby = lobbyManager.getLobby(currentLobbyId)
          if (nameLobby) {
            const player = nameLobby.players.find(p => p.id === playerId)
            if (player) player.name = name
            // Broadcast name change to all lobby members
            nameLobby.broadcast({ type: 'PLAYER_NAME_CHANGED', playerId, name })
            send({ type: 'PLAYER_NAME_CHANGED', playerId, name })
          }
          break
        }

        case 'REQUEST_SYNC': {
          if (!playerId || !currentLobbyId) {
            send({ type: 'ERROR', code: 'NOT_IN_LOBBY', message: 'Not in a lobby' })
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (lobby?.gameRoom) {
            const masked = lobby.gameRoom.getMaskedState(playerId)
            send({ type: 'STATE_UPDATE', state: masked })
          }
          break
        }
      }
    })

    socket.on('close', () => {
      if (playerId && currentLobbyId) {
        lobbyManager.playerDisconnected(currentLobbyId, playerId)
      }
    })

    socket.on('error', () => {
      if (playerId && currentLobbyId) {
        lobbyManager.playerDisconnected(currentLobbyId, playerId)
      }
    })
  })
}

function extractToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(/player_token=([^;]+)/)
  return match ? match[1] : null
}
