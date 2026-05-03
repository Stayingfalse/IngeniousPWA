import { WebSocket } from '@fastify/websocket'
import type {
  GameState,
  Color,
  MaskedGameState,
  GameResults,
  ServerMessage,
  AxialCoord,
  Tile,
  LastMove,
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
import { gameResultQueries, lobbyQueries, pushSubscriptionQueries, playerQueries, vapidKeys } from './database'
import { v4 as uuidv4 } from 'uuid'

// Lazy-load web-push to avoid crashing if not installed
function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: object,
): void {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push') as {
      setVapidDetails(subject: string, pub: string, priv: string): void
      sendNotification(sub: object, payload: string): Promise<void>
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:ingenious@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    )
    webpush.sendNotification(subscription, JSON.stringify(payload)).catch(() => {
      // Non-critical — push may fail if subscription expired
    })
  } catch {
    // web-push not available
  }
}

export class GameRoom {
  private state: GameState
  private connections: Map<string, WebSocket> = new Map()
  private startedAt: number = Date.now()
  private lobbyId: string
  private turnLimitMs: number | null
  private turnTimer: ReturnType<typeof setTimeout> | null = null
  private turnDeadline: number | null = null
  // Player display names for push notification messages
  private playerNames: Map<string, string> = new Map()
  // Last move info, broadcast once then cleared
  private pendingLastMove: LastMove | undefined = undefined
  // Pending swap: set after placement when rack lacks lowest-color tile
  private pendingSwapPlayerId: string | null = null

  constructor(
    lobbyId: string,
    playerIds: string[],
    playerNames: Record<string, string>,
    turnLimitMs: number | null,
  ) {
    this.lobbyId = lobbyId
    this.turnLimitMs = turnLimitMs
    for (const [id, name] of Object.entries(playerNames)) {
      this.playerNames.set(id, name)
    }

    const bag = createTileBag()
    const initialRacks: Record<string, Tile[]> = {}
    let remaining = bag

    for (const pid of playerIds) {
      const { drawn, remaining: rest } = drawTiles(remaining, 6)
      initialRacks[pid] = drawn
      remaining = rest
    }

    this.state = initGameState(lobbyId, playerIds, initialRacks, remaining)
    this.startTurnTimer()
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
    const lastMove = this.pendingLastMove
    this.pendingLastMove = undefined
    for (const playerId of this.state.playerOrder) {
      const swapAvailable = this.pendingSwapPlayerId === playerId
      const masked = maskGameState(this.state, playerId, this.turnDeadline, lastMove, swapAvailable)
      this.send(playerId, { type: 'STATE_UPDATE', state: masked })
    }
  }

  getMaskedState(playerId: string): MaskedGameState {
    const swapAvailable = this.pendingSwapPlayerId === playerId
    return maskGameState(this.state, playerId, this.turnDeadline, undefined, swapAvailable)
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

    // Capture tile colors before applyMove removes it from the rack
    const rack = this.state.playerRacks[playerId]
    const tile = rack?.[tileIndex]

    let result: ReturnType<typeof applyMove>
    try {
      result = applyMove(this.state, playerId, tileIndex, hexA, hexB)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.send(playerId, { type: 'ERROR', code: message, message })
      return
    }

    this.clearTurnTimer()

    const { newState, scoreDelta, ingenious } = result
    this.state = newState

    // Store last-move info for the next broadcastState call
    if (tile) {
      this.pendingLastMove = {
        hexA,
        hexB,
        colorA: tile.colorA,
        colorB: tile.colorB,
        scoreDelta,
      }
    }

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
      this.startTurnTimer()
      this.refillAndBroadcast(playerId, false)
      return
    }

    this.refillAndBroadcast(playerId, true)
  }

  handleSwapRack(playerId: string): void {
    // Swap is only valid as a post-placement action when it was flagged pending
    if (this.pendingSwapPlayerId !== playerId) {
      this.send(playerId, {
        type: 'ERROR',
        code: 'CANNOT_SWAP',
        message: 'Swap is only available after placing a tile when your refilled rack contains no tiles of your lowest-scoring color',
      })
      return
    }

    this.pendingSwapPlayerId = null

    // Return rack to bag, shuffle, then draw 6 new tiles
    const rack = this.state.playerRacks[playerId] || []
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
    this.checkForNoMoves()
    if (this.state.status === 'in_progress') {
      this.startTurnTimer()
      this.notifyCurrentPlayerIfOffline()
    }
    this.broadcastState()
  }

  handleDeclineSwap(playerId: string): void {
    if (this.pendingSwapPlayerId !== playerId) {
      this.send(playerId, {
        type: 'ERROR',
        code: 'NO_SWAP_PENDING',
        message: 'No swap is pending for this player',
      })
      return
    }

    this.pendingSwapPlayerId = null
    this.advanceTurn(playerId)
    this.checkForNoMoves()
    if (this.state.status === 'in_progress') {
      this.startTurnTimer()
      this.notifyCurrentPlayerIfOffline()
    }
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
      // Check if the refilled rack lacks the lowest-scoring color → offer a swap
      const playerScores = this.state.scores[playerId]
      const minColor = findMinColor(playerScores)
      const currentRack = this.state.playerRacks[playerId] || []
      const hasMinColor = currentRack.some(t => t.colorA === minColor || t.colorB === minColor)

      if (currentRack.length > 0 && !hasMinColor) {
        // Swap available — hold the turn, let the player decide
        this.pendingSwapPlayerId = playerId
        this.broadcastState()
        return
      }

      this.advanceTurn(playerId)
    }

    // Check if new current player has any legal moves
    this.checkForNoMoves()
    if (this.state.status === 'in_progress') {
      this.startTurnTimer()
      this.notifyCurrentPlayerIfOffline()
    }
    this.broadcastState()
  }

  private advanceTurn(playerId: string): void {
    const currentIndex = this.state.playerOrder.indexOf(playerId)
    const nextIndex = (currentIndex + 1) % this.state.playerOrder.length
    this.state = { ...this.state, currentPlayerId: this.state.playerOrder[nextIndex] }
  }

  private checkForNoMoves(): void {
    const totalPlayers = this.state.playerOrder.length
    let skipped = 0

    while (skipped < totalPlayers && !hasLegalMove(this.state, this.state.currentPlayerId)) {
      skipped++
      this.advanceTurn(this.state.currentPlayerId)
    }

    if (skipped >= totalPlayers) {
      const winner = determineWinnerByScore(this.state)
      this.finishGame(winner, 'no_moves')
    }
  }

  private startTurnTimer(): void {
    this.clearTurnTimer()
    if (this.turnLimitMs === null) {
      // Async / turn-based mode — no timer
      this.turnDeadline = null
      return
    }
    this.turnDeadline = Date.now() + this.turnLimitMs
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout()
    }, this.turnLimitMs)
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer)
      this.turnTimer = null
    }
    this.turnDeadline = null
  }

  private handleTurnTimeout(): void {
    if (this.state.status !== 'in_progress') return

    const timedOutPlayer = this.state.currentPlayerId
    this.advanceTurn(timedOutPlayer)
    this.checkForNoMoves()
    if (this.state.status === 'in_progress') {
      this.startTurnTimer()
      this.notifyCurrentPlayerIfOffline()
    }
    this.broadcastState()
  }

  /**
   * In async mode, when the current player is not connected, send a push
   * notification so they know it is their turn.
   */
  private notifyCurrentPlayerIfOffline(): void {
    if (this.turnLimitMs !== null) return // only in async mode
    const currentPlayerId = this.state.currentPlayerId
    const ws = this.connections.get(currentPlayerId)
    const isOnline = ws && ws.readyState === 1
    if (isOnline) return

    try {
      const sub = pushSubscriptionQueries.findByPlayer.get(currentPlayerId)
      if (!sub) return
      const playerName = this.playerNames.get(currentPlayerId) ?? 'You'
      sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        {
          title: 'Ingenious – Your Turn!',
          body: `${playerName}, it's your turn in game ${this.lobbyId}.`,
          url: `/?join=${this.lobbyId}`,
        },
      )
    } catch {
      // Non-critical
    }
  }

  private finishGame(winner: string | null, reason: 'all_eighteen' | 'no_moves'): void {
    this.clearTurnTimer()
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
