import { WebSocket } from '@fastify/websocket'
import type {
  GameState,
  Color,
  MaskedGameState,
  GameResults,
  ServerMessage,
  AxialCoord,
  Tile,
} from '@ingenious/shared'
import {
  applyMove,
  finalizeTurn,
  checkWinCondition,
  determineWinnerByScore,
  maskGameState,
  hasLegalMove,
  initGameState,
  findMinColor,
  COLORS,
  createTileBag,
  drawTiles,
  emptyScores,
  minScore,
} from '@ingenious/shared'
import { gameResultQueries, lobbyQueries } from './database'
import { v4 as uuidv4 } from 'uuid'

export class GameRoom {
  private state: GameState
  private connections: Map<string, WebSocket> = new Map()
  private startedAt: number = Date.now()
  private lobbyId: string

  constructor(lobbyId: string, playerIds: string[]) {
    this.lobbyId = lobbyId
    const bag = createTileBag()
    const initialRacks: Record<string, Tile[]> = {}
    let remaining = bag

    for (const pid of playerIds) {
      const { drawn, remaining: rest } = drawTiles(remaining, 6)
      initialRacks[pid] = drawn
      remaining = rest
    }

    this.state = initGameState(lobbyId, playerIds, initialRacks, remaining)
  }

  addConnection(playerId: string, ws: WebSocket): void {
    this.connections.set(playerId, ws)
  }

  removeConnection(playerId: string): void {
    this.connections.delete(playerId)
  }

  send(playerId: string, msg: ServerMessage): void {
    const ws = this.connections.get(playerId)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }

  broadcast(msg: ServerMessage, excludePlayerId?: string): void {
    for (const [pid, ws] of this.connections) {
      if (pid !== excludePlayerId && ws.readyState === 1) {
        ws.send(JSON.stringify(msg))
      }
    }
  }

  broadcastState(): void {
    for (const playerId of this.state.playerOrder) {
      const masked = maskGameState(this.state, playerId)
      this.send(playerId, { type: 'STATE_UPDATE', state: masked })
    }
  }

  getMaskedState(playerId: string): MaskedGameState {
    return maskGameState(this.state, playerId)
  }

  handlePlaceTile(
    playerId: string,
    tileIndex: number,
    hexA: AxialCoord,
    hexB: AxialCoord,
  ): void {
    if (this.state.status !== 'in_progress') {
      this.send(playerId, { type: 'ERROR', code: 'GAME_NOT_ACTIVE', message: 'Game is not active' })
      return
    }

    if (this.state.currentPlayerId !== playerId) {
      this.send(playerId, { type: 'ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn' })
      return
    }

    let result: ReturnType<typeof applyMove>
    try {
      result = applyMove(this.state, playerId, tileIndex, hexA, hexB)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.send(playerId, { type: 'ERROR', code: message, message })
      return
    }

    const { newState, ingenious } = result
    this.state = newState

    // Announce INGENIOUS! events
    for (const color of ingenious) {
      this.broadcast({ type: 'INGENIOUS', playerId, color })
    }

    // Check instant win (all 18s)
    const instantWinner = checkWinCondition(this.state)
    if (instantWinner) {
      this.finishGame(instantWinner, 'all_eighteen')
      return
    }

    // If bonus turns owed, player keeps their turn
    if (this.state.bonusTurnsOwed > 0) {
      this.state = { ...this.state, bonusTurnsOwed: this.state.bonusTurnsOwed - 1 }
      this.refillAndBroadcast(playerId, false)
      return
    }

    // Check if player can swap rack before refilling
    // (handled by client sending SWAP_RACK or the turn ending normally)
    this.refillAndBroadcast(playerId, true)
  }

  handleSwapRack(playerId: string): void {
    if (this.state.currentPlayerId !== playerId) {
      this.send(playerId, { type: 'ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn' })
      return
    }

    const playerScores = this.state.scores[playerId]
    const minColor = findMinColor(playerScores)
    const rack = this.state.playerRacks[playerId] || []
    const hasMinColor = rack.some(t => t.colorA === minColor || t.colorB === minColor)

    if (hasMinColor) {
      this.send(playerId, {
        type: 'ERROR',
        code: 'CANNOT_SWAP',
        message: 'Cannot swap: rack contains lowest-scoring color',
      })
      return
    }

    // Return rack to bag and draw 6 new tiles
    let bag = [...this.state.tileBag, ...rack]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }

    const { drawn, remaining } = drawTiles(bag, 6)
    const newPlayerRacks = { ...this.state.playerRacks, [playerId]: drawn }
    this.state = {
      ...this.state,
      playerRacks: newPlayerRacks,
      tileBag: remaining,
    }

    this.send(playerId, { type: 'YOUR_NEW_RACK', rack: drawn })
    this.advanceTurn(playerId)
    this.broadcastState()
  }

  private refillAndBroadcast(playerId: string, advanceTurn: boolean): void {
    // Refill current player's rack
    const rack = this.state.playerRacks[playerId] || []
    const needed = 6 - rack.length
    if (needed > 0) {
      const { drawn, remaining } = drawTiles(this.state.tileBag, needed)
      const newRack = [...rack, ...drawn]
      this.state = {
        ...this.state,
        playerRacks: { ...this.state.playerRacks, [playerId]: newRack },
        tileBag: remaining,
      }
      if (drawn.length > 0) {
        this.send(playerId, { type: 'YOUR_NEW_RACK', rack: newRack })
      }
    }

    if (advanceTurn) {
      this.advanceTurn(playerId)
    }

    // Check if new current player has any legal moves
    this.checkForNoMoves()
    this.broadcastState()
  }

  private advanceTurn(playerId: string): void {
    const currentIndex = this.state.playerOrder.indexOf(playerId)
    const nextIndex = (currentIndex + 1) % this.state.playerOrder.length
    this.state = { ...this.state, currentPlayerId: this.state.playerOrder[nextIndex] }
  }

  private checkForNoMoves(): void {
    // Check if current player has no legal moves
    const currentPlayer = this.state.currentPlayerId
    if (!hasLegalMove(this.state, currentPlayer)) {
      // Game over - no legal placements remain for current player
      const winner = determineWinnerByScore(this.state)
      this.finishGame(winner, 'no_moves')
    }
  }

  private finishGame(winner: string | null, reason: 'all_eighteen' | 'no_moves'): void {
    this.state = { ...this.state, status: 'finished', winner }

    const results: GameResults = {
      winner,
      scores: this.state.scores,
      reason,
    }

    this.broadcast({ type: 'GAME_OVER', results })

    // Persist to DB
    try {
      const duration = Math.floor((Date.now() - this.startedAt) / 1000)
      gameResultQueries.insert.run(
        uuidv4(),
        this.lobbyId,
        winner,
        JSON.stringify(this.state.scores),
        this.state.moveCount,
        duration,
      )
      lobbyQueries.setFinished.run('finished', this.lobbyId)
    } catch {
      // Non-critical DB write
    }
  }

  getState(): GameState {
    return this.state
  }

  isFinished(): boolean {
    return this.state.status === 'finished'
  }
}
