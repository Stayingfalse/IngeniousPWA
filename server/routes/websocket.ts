import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import type { ClientMessage } from '@ingenious/shared'
import { playerQueries } from '../services/database'
import { lobbyManager } from '../services/lobbyManager'
import { v4 as uuidv4 } from 'uuid'
import { wsError } from '../lib/errors'

export default async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    let playerId: string | null = null
    let currentLobbyId: string | null = null
    let isSpectatorConnection = false

    const send = (msg: object) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg))
      }
    }

    const sendError = (code: string, message?: string) => {
      send(wsError(code, message))
    }

    socket.on('message', (rawData: Buffer | string) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(rawData.toString()) as ClientMessage
      } catch {
        sendError('INVALID_JSON', 'Invalid JSON')
        return
      }

      switch (msg.type) {
        case 'SET_AUTO_START': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const result = lobbyManager.setAutoStart(currentLobbyId, playerId, msg.enabled)
          if (result.error) {
            sendError(result.error)
          }
          break
        }

        case 'KICK_PLAYER': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const result = lobbyManager.kickPlayer(currentLobbyId, playerId, msg.targetPlayerId)
          if (result.error) {
            sendError(result.error)
          }
          break
        }

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

          const newLobbyId = lobbyId.toUpperCase()

          // If switching to a different lobby, detach from the current one first
          if (currentLobbyId && currentLobbyId !== newLobbyId) {
            const oldLobby = lobbyManager.getLobby(currentLobbyId)
            if (oldLobby) {
              if (oldLobby.turnMode === 'async' && (oldLobby.status === 'in_progress' || oldLobby.status === 'waiting')) {
                // Silently detach — player stays in the async game/lobby
                oldLobby.detachConnection(pid)
              } else {
                lobbyManager.playerDisconnected(currentLobbyId, pid)
              }
            }
          }

          currentLobbyId = newLobbyId
          const result = lobbyManager.joinLobby(currentLobbyId, pid, playerName, socket)

          if ('error' in result) {
            sendError(result.error)
            return
          }

          const { lobby } = result

          // Spectator path: non-participant watching an in-progress game
          if ('isSpectator' in result && result.isSpectator) {
            isSpectatorConnection = true
            // Add to lobby spectators list before broadcasting join (WS not added yet)
            const spectatorEntry = { id: pid, name: playerName }
            lobby.spectators.push(spectatorEntry)
            // Notify existing connections about the new spectator
            lobby.gameRoom!.broadcast({ type: 'SPECTATOR_JOINED', spectator: spectatorEntry })
            // Now add spectator's WS and send initial state
            lobby.gameRoom!.addSpectatorConnection(pid, socket)
            send({
              type: 'SPECTATING',
              state: lobby.gameRoom!.getSpectatorState(),
              lobbyState: lobby.getLobbyState(),
            })
            break
          }

          isSpectatorConnection = false
          const { seat } = result as { lobby: typeof lobby; seat: number }

          send({
            type: 'JOINED',
            playerId: pid,
            seat,
            lobbyState: lobby.getLobbyState(),
          })

          // Notify others
          const playerInfo = { id: pid, name: playerName, seat }
          lobby.broadcast({ type: 'PLAYER_JOINED', player: playerInfo }, pid)

          // Auto-start vsAI game when the human player has joined (AI was already added)
          let vsAiAutoStarted = false
          if (lobby.vsAI && lobby.status === 'waiting' && lobby.players.length >= lobby.maxPlayers) {
            const startResult = lobbyManager.startGame(currentLobbyId, pid)
            if (!startResult.error) {
              vsAiAutoStarted = true
            }
          }

          // Auto-start when an async lobby with autoStart=true fills up
          let autoStarted = false
          if (!vsAiAutoStarted && lobby.autoStart && lobby.status === 'waiting' && lobby.players.length >= lobby.maxPlayers) {
            // Use force=true since we bypass the normal host-only restriction
            const startResult = lobbyManager.startGame(currentLobbyId, pid, true)
            if (!startResult.error) {
              autoStarted = true
            }
          }

          // If game is in progress and this is a reconnect (not a fresh vsAI start),
          // send current state so the player can resume
          if (lobby.gameRoom && lobby.status === 'in_progress' && !vsAiAutoStarted && !autoStarted) {
            lobby.gameRoom.addConnection(pid, socket)
            const masked = lobby.gameRoom.getMaskedState(pid)
            send({ type: 'STATE_UPDATE', state: masked })
          }
          break
        }

        case 'START_GAME': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const startResult = lobbyManager.startGame(currentLobbyId, playerId)
          if (startResult.error) {
            sendError(startResult.error)
          }
          break
        }

        case 'PLACE_TILE': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            sendError('NO_GAME', 'No active game')
            return
          }

          lobby.gameRoom.handlePlaceTile(playerId, msg.tileIndex, msg.hexA, msg.hexB)
          break
        }

        case 'SWAP_RACK': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            sendError('NO_GAME', 'No active game')
            return
          }

          lobby.gameRoom.handleSwapRack(playerId)
          break
        }

        case 'DECLINE_SWAP': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            sendError('NO_GAME', 'No active game')
            return
          }

          lobby.gameRoom.handleDeclineSwap(playerId)
          break
        }

        case 'FORFEIT_GAME': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (!lobby?.gameRoom) {
            sendError('NO_GAME', 'No active game')
            return
          }

          lobby.gameRoom.handleForfeit(playerId)
          break
        }

        case 'CHANGE_NAME': {
          if (!playerId || !currentLobbyId || isSpectatorConnection) {
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const name = msg.name?.trim()
          if (!name || name.length < 1 || name.length > 20) {
            sendError('INVALID_NAME', 'Name must be 1-20 characters')
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
            sendError('NOT_IN_LOBBY', 'Not in a lobby')
            return
          }

          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (lobby?.gameRoom) {
            if (isSpectatorConnection) {
              send({ type: 'STATE_UPDATE', state: lobby.gameRoom.getSpectatorState() })
            } else {
              const masked = lobby.gameRoom.getMaskedState(playerId)
              send({ type: 'STATE_UPDATE', state: masked })
            }
          }
          break
        }
      }
    })

    const handleDisconnect = () => {
      if (playerId && currentLobbyId) {
        if (isSpectatorConnection) {
          const lobby = lobbyManager.getLobby(currentLobbyId)
          if (lobby) {
            // Remove from spectator list and WS first, then broadcast departure
            lobby.spectators = lobby.spectators.filter(s => s.id !== playerId)
            lobby.gameRoom?.removeSpectatorConnection(playerId)
            if (lobby.gameRoom) {
              lobby.gameRoom.broadcast({ type: 'SPECTATOR_LEFT', spectatorId: playerId })
            }
          }
        } else {
          lobbyManager.playerDisconnected(currentLobbyId, playerId)
        }
      }
    }

    socket.on('close', handleDisconnect)
    socket.on('error', handleDisconnect)
  })
}

function extractToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(/player_token=([^;]+)/)
  return match ? match[1] : null
}
