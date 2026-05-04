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
  AiDifficulty,
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
import { gameResultQueries, lobbyQueries, playerQueries, snapshotQueries } from './database'
import { AI_PLAYER_ID, chooseBestMove } from './aiPlayer'
import { v4 as uuidv4 } from 'uuid'
import { notifyPlayerTurnIfOffline } from './pushNotifications'
import { wsError } from '../lib/errors'
import { createTurnTimer } from './turnTimer'

export interface GameRoomSnapshot {
  state: GameState
  playerNames: Record<string, string>
  turnLimitMs: number | null
  pendingSwapPlayerId: string | null
}

export class GameRoom {
  private state: GameState
  private connections: Map<string, WebSocket> = new Map()
  private spectatorConnections: Map<string, WebSocket> = new Map()
  private startedAt: number = Date.now()
  private lobbyId: string
  private turnLimitMs: number | null
  private turnTimer = createTurnTimer()
  private turnDeadline: number | null = null
  // Player display names for push notification messages
  private playerNames: Map<string, string> = new Map()
  // Last move info, broadcast once then cleared
  private pendingLastMove: LastMove | undefined = undefined
  // Pending swap: set after placement when rack lacks lowest-color tile
  private pendingSwapPlayerId: string | null = null
  // Optional callback invoked after each state-changing move (used for snapshots)
  onAfterMove: (() => void) | null = null
  // Set of player IDs that are AI-controlled
  private aiPlayerIds: Set<string> = new Set()
  // AI difficulty level
  private aiDifficulty: AiDifficulty = 'hard'

  constructor(
    lobbyId: string,
    playerIds: string[],
    playerNames: Record<string, string>,
    turnLimitMs: number | null,
    aiPlayerIds?: Set<string>,
    aiDifficulty: AiDifficulty = 'hard',
  ) {
    this.lobbyId = lobbyId
    this.turnLimitMs = turnLimitMs
    this.aiPlayerIds = aiPlayerIds ?? new Set()
    this.aiDifficulty = aiDifficulty
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

  /**
   * Reconstruct a GameRoom from a persisted snapshot without re-initialising
   * the game state (no new tiles drawn, no new player order).
   */
  static fromSnapshot(lobbyId: string, data: GameRoomSnapshot): GameRoom {
    const room = Object.create(GameRoom.prototype) as GameRoom
    room.lobbyId = lobbyId
    room.turnLimitMs = data.turnLimitMs
    room.state = { ...data.state, forfeitedPlayerIds: data.state.forfeitedPlayerIds ?? [] }
    room.connections = new Map()
    room.spectatorConnections = new Map()
    room.startedAt = Date.now()
    room.playerNames = new Map(Object.entries(data.playerNames))
    room.pendingLastMove = undefined
    room.pendingSwapPlayerId = data.pendingSwapPlayerId
    room.turnTimer = createTurnTimer()
    room.turnDeadline = null
    room.onAfterMove = null
    room.aiPlayerIds = new Set(data.state.playerOrder.filter(id => id === AI_PLAYER_ID))
    if (data.state.status === 'in_progress') {
      room.startTurnTimer()
    }
    return room
  }

  /** Return a serialisable snapshot of the current game room state. */
  getSnapshotData(): GameRoomSnapshot {
    return {
      state: this.state,
      playerNames: Object.fromEntries(this.playerNames),
      turnLimitMs: this.turnLimitMs,
      pendingSwapPlayerId: this.pendingSwapPlayerId,
    }
  }

  addConnection(playerId: string, ws: WebSocket): void {
    this.connections.set(playerId, ws)
  }

  removeConnection(playerId: string): void {
    this.connections.delete(playerId)
  }

  addSpectatorConnection(spectatorId: string, ws: WebSocket): void {
    this.spectatorConnections.set(spectatorId, ws)
  }

  removeSpectatorConnection(spectatorId: string): void {
    this.spectatorConnections.delete(spectatorId)
  }

  /** Return a masked state suitable for a spectator (empty rack, isSpectator flag set). */
  getSpectatorState(): MaskedGameState {
    return {
      ...maskGameState(this.state, '', this.turnDeadline, undefined, false),
      isSpectator: true,
    }
  }

  send(playerId: string, msg: ServerMessage): void {
    const ws = this.connections.get(playerId)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }

  private sendError(playerId: string, code: string, message?: string): void {
    this.send(playerId, wsError(code, message))
  }

  broadcast(msg: ServerMessage, excludePlayerId?: string): void {
    for (const [pid, ws] of this.connections) {
      if (pid !== excludePlayerId && ws.readyState === 1) {
        ws.send(JSON.stringify(msg))
      }
    }
    // Spectators receive all game-level broadcasts (GAME_OVER, INGENIOUS, etc.)
    for (const [, ws] of this.spectatorConnections) {
      if (ws.readyState === 1) {
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
    // Send spectator-safe state (empty rack, isSpectator flag) to any watching connections
    if (this.spectatorConnections.size > 0) {
      const spectatorState: MaskedGameState = {
        ...maskGameState(this.state, '', this.turnDeadline, lastMove, false),
        isSpectator: true,
      }
      const payload = JSON.stringify({ type: 'STATE_UPDATE', state: spectatorState })
      for (const [, ws] of this.spectatorConnections) {
        if (ws.readyState === 1) {
          ws.send(payload)
        }
      }
    }
    this.maybeScheduleAiMove()
  }

  /** Called by LobbyManager after the game starts to trigger the first AI move if needed. */
  scheduleAiMoveIfNeeded(): void {
    this.maybeScheduleAiMove()
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
      this.sendError(playerId, 'GAME_NOT_ACTIVE', 'Game is not active')
      return
    }

    if (this.state.currentPlayerId !== playerId) {
      this.sendError(playerId, 'NOT_YOUR_TURN', 'Not your turn')
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
      this.sendError(playerId, 'INVALID_MOVE', message)
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

    // Check instant win (all 18s) — send INGENIOUS before GAME_OVER if applicable
    const instantWinner = checkWinCondition(this.state)
    if (instantWinner) {
      for (const color of ingenious) {
        this.broadcast({ type: 'INGENIOUS', playerId, color })
      }
      this.finishGame(instantWinner, 'all_eighteen')
      return
    }

    // If bonus turns owed, player keeps their turn
    if (this.state.bonusTurnsOwed > 0) {
      this.state = { ...this.state, bonusTurnsOwed: this.state.bonusTurnsOwed - 1 }
      this.startTurnTimer()
      this.refillAndBroadcast(playerId, false)
      // Announce INGENIOUS! events after STATE_UPDATE so scores are current
      for (const color of ingenious) {
        this.broadcast({ type: 'INGENIOUS', playerId, color })
      }
      return
    }

    this.refillAndBroadcast(playerId, true)
    // Announce INGENIOUS! events after STATE_UPDATE so scores are current
    for (const color of ingenious) {
      this.broadcast({ type: 'INGENIOUS', playerId, color })
    }
  }

  handleSwapRack(playerId: string): void {
    // Swap is only valid as a post-placement action when it was flagged pending
    if (this.pendingSwapPlayerId !== playerId) {
      this.sendError(
        playerId,
        'CANNOT_SWAP',
        'Swap is only available after placing a tile when your refilled rack contains no tiles of your lowest-scoring color',
      )
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
    if (this.state.status === 'in_progress') {
      this.onAfterMove?.()
    }
  }

  handleDeclineSwap(playerId: string): void {
    if (this.pendingSwapPlayerId !== playerId) {
      this.sendError(playerId, 'NO_SWAP_PENDING', 'No swap is pending for this player')
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
    if (this.state.status === 'in_progress') {
      this.onAfterMove?.()
    }
  }

  handleForfeit(playerId: string): void {
    if (this.state.status !== 'in_progress') {
      this.sendError(playerId, 'GAME_NOT_ACTIVE', 'Game is not active')
      return
    }

    const alreadyForfeited = (this.state.forfeitedPlayerIds ?? []).includes(playerId)
    if (alreadyForfeited) return

    // Mark as forfeited
    const forfeitedPlayerIds = [...(this.state.forfeitedPlayerIds ?? []), playerId]
    this.state = { ...this.state, forfeitedPlayerIds }

    // Inform all connected players
    this.broadcast({ type: 'PLAYER_FORFEITED', playerId })

    // If only 1 active player remains they win by forfeit
    const activePlayers = this.state.playerOrder.filter(p => !forfeitedPlayerIds.includes(p))
    if (activePlayers.length <= 1) {
      const winner = activePlayers[0] ?? null
      this.finishGame(winner, 'forfeit')
      return
    }

    // If the forfeiting player currently held the turn, advance past them
    if (this.state.currentPlayerId === playerId) {
      this.clearTurnTimer()
      this.pendingSwapPlayerId = null
      this.advanceTurn(playerId)
      this.checkForNoMoves()
      if (this.state.status === 'in_progress') {
        this.startTurnTimer()
        this.notifyCurrentPlayerIfOffline()
      }
    }

    this.broadcastState()
    if (this.state.status === 'in_progress') {
      this.onAfterMove?.()
    }
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
        if (this.state.status === 'in_progress') {
          this.onAfterMove?.()
        }
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
    if (this.state.status === 'in_progress') {
      this.onAfterMove?.()
    }
  }

  private advanceTurn(playerId: string): void {
    const forfeited = new Set(this.state.forfeitedPlayerIds ?? [])
    const order = this.state.playerOrder
    const currentIndex = order.indexOf(playerId)
    let nextIndex = (currentIndex + 1) % order.length
    // Skip over any forfeited players
    for (let i = 0; i < order.length; i++) {
      if (!forfeited.has(order[nextIndex])) break
      nextIndex = (nextIndex + 1) % order.length
    }
    this.state = { ...this.state, currentPlayerId: order[nextIndex] }
  }

  private checkForNoMoves(): void {
    const forfeited = new Set(this.state.forfeitedPlayerIds ?? [])
    const activePlayers = this.state.playerOrder.filter(p => !forfeited.has(p))
    if (activePlayers.length === 0) return

    let skipped = 0
    while (skipped < activePlayers.length && !hasLegalMove(this.state, this.state.currentPlayerId)) {
      skipped++
      this.advanceTurn(this.state.currentPlayerId)
    }

    if (skipped >= activePlayers.length) {
      // Only active (non-forfeited) players are eligible to win
      const filteredState = { ...this.state, playerOrder: activePlayers }
      const winner = determineWinnerByScore(filteredState)
      this.finishGame(winner, 'no_moves')
    }
  }

  private maybeScheduleAiMove(): void {
    if (this.state.status !== 'in_progress') return
    const currentPlayer = this.state.currentPlayerId
    if (!this.aiPlayerIds.has(currentPlayer)) return

    const delay = 600 // ms — brief pause so the player sees the board update first

    if (this.pendingSwapPlayerId === currentPlayer) {
      // AI always declines the rack swap option
      setTimeout(() => {
        if (this.state.status === 'in_progress' && this.pendingSwapPlayerId === currentPlayer) {
          this.handleDeclineSwap(currentPlayer)
        }
      }, delay)
    } else {
      setTimeout(() => {
        if (this.state.status === 'in_progress' && this.state.currentPlayerId === currentPlayer) {
          this.handleAiMove()
        }
      }, delay)
    }
  }

  private handleAiMove(): void {
    const playerId = this.state.currentPlayerId
    if (!this.aiPlayerIds.has(playerId)) return
    const move = chooseBestMove(this.state, playerId, this.aiDifficulty)
    if (!move) return // checkForNoMoves should have ended the game already
    this.handlePlaceTile(playerId, move.tileIndex, move.hexA, move.hexB)
  }

  private startTurnTimer(): void {
    this.clearTurnTimer()
    if (this.turnLimitMs === null) {
      // Async / turn-based mode — no timer
      this.turnDeadline = null
      return
    }
    this.turnDeadline = this.turnTimer.start({
      turnLimitMs: this.turnLimitMs,
      onTimeout: () => this.handleTurnTimeout(),
    })
  }

  private clearTurnTimer(): void {
    this.turnTimer.clear()
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

    notifyPlayerTurnIfOffline({
      lobbyId: this.lobbyId,
      currentPlayerId,
      playerDisplayName: this.playerNames.get(currentPlayerId) ?? 'You',
      isOnline: Boolean(isOnline),
    })
  }

  private finishGame(winner: string | null, reason: 'all_eighteen' | 'no_moves' | 'forfeit'): void {
    this.clearTurnTimer()
    this.state = { ...this.state, status: 'finished', winner }

    const results: GameResults = {
      winner,
      scores: this.state.scores,
      reason,
    }

    this.broadcast({ type: 'GAME_OVER', results })

    // Persist to DB and clean up snapshot
    try {
      const duration = Math.floor((Date.now() - this.startedAt) / 1000)
      gameResultQueries.insert.run(
        uuidv4(),
        this.lobbyId,
        winner,
        JSON.stringify(this.state.scores),
        this.state.moveCount,
        duration,
        reason,
      )
      lobbyQueries.setFinished.run('finished', this.lobbyId)
      snapshotQueries.delete.run(this.lobbyId)
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
