import type { GameState, Color, Tile } from './types'
import type { AxialCoord } from './hexGrid'
import {
  key, add, isAdjacent, inBounds, allHexes, startSymbolPositions, HEX_DIRS, dirBetween,
} from './hexGrid'
import { scoreMove, addScores, emptyScores, minScore, COLORS } from './scoring'
import { drawTiles } from './tileBag'

export function radiusForPlayerCount(playerCount: number): number {
  if (playerCount <= 2) return 6
  if (playerCount === 3) return 7
  return 8
}

export function isLegalPlacement(
  hexA: AxialCoord,
  hexB: AxialCoord,
  board: Record<string, Color>,
  radius: number,
  isFirstMove: boolean,
  usedStartSymbols: string[],
): boolean {
  // Both hexes must be in bounds
  if (!inBounds(hexA, radius) || !inBounds(hexB, radius)) return false

  // Both hexes must be empty
  if (board[key(hexA)] !== undefined) return false
  if (board[key(hexB)] !== undefined) return false

  // Both hexes must be adjacent to each other
  if (!isAdjacent(hexA, hexB)) return false

  // First move: at least one hex must be adjacent to an unused start symbol
  if (isFirstMove) {
    const startSymbols = startSymbolPositions(radius)
    const availableSymbols = startSymbols.filter(s => !usedStartSymbols.includes(key(s)))

    const touchesAvailableStart = availableSymbols.some(sym => {
      return isAdjacent(hexA, sym) || isAdjacent(hexB, sym)
    })

    if (!touchesAvailableStart) return false
  }

  return true
}

export function getLegalPlacements(
  board: Record<string, Color>,
  radius: number,
  isFirstMove: boolean,
  usedStartSymbols: string[],
): Array<{ hexA: AxialCoord; hexB: AxialCoord }> {
  const placements: Array<{ hexA: AxialCoord; hexB: AxialCoord }> = []
  const hexes = allHexes(radius)
  const emptyHexes = hexes.filter(h => board[key(h)] === undefined)

  for (const hexA of emptyHexes) {
    for (const dir of HEX_DIRS) {
      const hexB = add(hexA, dir)
      if (
        inBounds(hexB, radius) &&
        board[key(hexB)] === undefined &&
        isLegalPlacement(hexA, hexB, board, radius, isFirstMove, usedStartSymbols)
      ) {
        placements.push({ hexA, hexB })
      }
    }
  }

  return placements
}

export function checkWinCondition(state: GameState): string | null {
  // Check if any player has 18 in all 6 colors
  for (const playerId of state.playerOrder) {
    const scores = state.scores[playerId]
    if (scores && COLORS.every(c => scores[c] >= 18)) {
      return playerId
    }
  }
  return null
}

export function maskGameState(state: GameState, viewingPlayerId: string) {
  const otherRackSizes: Record<string, number> = {}
  for (const pid of state.playerOrder) {
    if (pid !== viewingPlayerId) {
      otherRackSizes[pid] = state.playerRacks[pid]?.length ?? 0
    }
  }

  const { tileBag, playerRacks, ...rest } = state
  return {
    ...rest,
    tileBagCount: tileBag.length,
    myRack: playerRacks[viewingPlayerId] ?? [],
    otherRackSizes,
  }
}

export function applyMove(
  state: GameState,
  playerId: string,
  tileIndex: number,
  hexA: AxialCoord,
  hexB: AxialCoord,
): { newState: GameState; scoreDelta: Record<Color, number>; ingenious: Color[] } {
  if (state.currentPlayerId !== playerId) {
    throw new Error('NOT_YOUR_TURN')
  }

  const rack = state.playerRacks[playerId]
  if (!rack || tileIndex < 0 || tileIndex >= rack.length) {
    throw new Error('INVALID_TILE_INDEX')
  }

  const tile = rack[tileIndex]
  const isFirstMove = state.firstTurnPlayersRemaining.includes(playerId)

  if (!isLegalPlacement(hexA, hexB, state.board, state.radius, isFirstMove, state.usedStartSymbols)) {
    throw new Error('ILLEGAL_PLACEMENT')
  }

  // Build new board with the placed tile
  const newBoard = { ...state.board }
  newBoard[key(hexA)] = tile.colorA
  newBoard[key(hexB)] = tile.colorB

  // Score the move
  const scoreDelta = scoreMove(hexA, hexB, tile.colorA, tile.colorB, newBoard)

  // Update player scores
  const oldScores = state.scores[playerId]
  const newScores = addScores(oldScores, scoreDelta)

  // Determine which colors just reached 18 (INGENIOUS!)
  const ingenious: Color[] = []
  for (const color of COLORS) {
    if (oldScores[color] < 18 && newScores[color] >= 18) {
      ingenious.push(color)
    }
  }

  // Update rack (remove used tile)
  const newRack = rack.filter((_, i) => i !== tileIndex)
  const newPlayerRacks = { ...state.playerRacks, [playerId]: newRack }

  // Update first-turn tracking
  const newFirstTurnRemaining = state.firstTurnPlayersRemaining.filter(id => id !== playerId)

  // Update used start symbols if this was a first move
  let newUsedStartSymbols = [...state.usedStartSymbols]
  if (isFirstMove) {
    const startSymbols = startSymbolPositions(state.radius)
    for (const sym of startSymbols) {
      if (
        !newUsedStartSymbols.includes(key(sym)) &&
        (isAdjacent(hexA, sym) || isAdjacent(hexB, sym))
      ) {
        newUsedStartSymbols.push(key(sym))
        break
      }
    }
  }

  // Bonus turns: each INGENIOUS! grants one bonus turn
  const newBonusTurnsOwed = state.bonusTurnsOwed + ingenious.length

  const newState: GameState = {
    ...state,
    board: newBoard,
    playerRacks: newPlayerRacks,
    scores: { ...state.scores, [playerId]: newScores },
    bonusTurnsOwed: newBonusTurnsOwed,
    moveCount: state.moveCount + 1,
    firstTurnPlayersRemaining: newFirstTurnRemaining,
    usedStartSymbols: newUsedStartSymbols,
  }

  return { newState, scoreDelta, ingenious }
}

export function finalizeTurn(
  state: GameState,
  playerId: string,
  swapRack: boolean,
): GameState {
  let newState = { ...state }
  const playerRacks = { ...newState.playerRacks }
  let bag = [...newState.tileBag]

  // Handle rack swap: discard entire rack, draw 6 new tiles
  if (swapRack) {
    const playerScores = newState.scores[playerId]
    const min = minScore(playerScores)
    const rack = playerRacks[playerId] || []
    const hasMinColor = rack.some(t => t.colorA === findMinColor(playerScores) || t.colorB === findMinColor(playerScores))

    if (!hasMinColor) {
      // Return rack to bag and reshuffle, then draw 6
      const returnedTiles = rack
      bag = [...bag, ...returnedTiles]
      // Fisher-Yates shuffle
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      const { drawn, remaining } = drawTiles(bag, 6)
      playerRacks[playerId] = drawn
      bag = remaining
    }
  }

  // Refill rack up to 6
  const currentRack = playerRacks[playerId] || []
  const needed = 6 - currentRack.length
  if (needed > 0) {
    const { drawn, remaining } = drawTiles(bag, needed)
    playerRacks[playerId] = [...currentRack, ...drawn]
    bag = remaining
  }

  newState.playerRacks = playerRacks
  newState.tileBag = bag

  // Determine next player
  if (newState.bonusTurnsOwed > 0) {
    newState.bonusTurnsOwed--
    // Same player gets another turn
  } else {
    // Advance to next player
    const currentIndex = newState.playerOrder.indexOf(playerId)
    const nextIndex = (currentIndex + 1) % newState.playerOrder.length
    newState.currentPlayerId = newState.playerOrder[nextIndex]
  }

  return newState
}

function findMinColor(scores: Record<Color, number>): Color {
  let minColor: Color = 'red'
  let minVal = Infinity
  for (const color of COLORS) {
    if ((scores[color] || 0) < minVal) {
      minVal = scores[color] || 0
      minColor = color
    }
  }
  return minColor
}

export function hasLegalMove(
  state: GameState,
  playerId: string,
): boolean {
  const rack = state.playerRacks[playerId]
  if (!rack || rack.length === 0) return false

  const isFirstMove = state.firstTurnPlayersRemaining.includes(playerId)
  const placements = getLegalPlacements(
    state.board,
    state.radius,
    isFirstMove,
    state.usedStartSymbols,
  )
  return placements.length > 0
}

export function determineWinnerByScore(state: GameState): string | null {
  if (state.playerOrder.length === 0) return null

  // Winner = player with highest minimum score; tiebreak on second-lowest, etc.
  const playerScores = state.playerOrder.map(pid => ({
    pid,
    sortedScores: COLORS.map(c => state.scores[pid]?.[c] ?? 0).sort((a, b) => a - b),
  }))

  playerScores.sort((a, b) => {
    for (let i = 0; i < a.sortedScores.length; i++) {
      if (a.sortedScores[i] !== b.sortedScores[i]) {
        return b.sortedScores[i] - a.sortedScores[i]
      }
    }
    return 0
  })

  return playerScores[0].pid
}

export function initGameState(
  lobbyId: string,
  playerIds: string[],
  initialRacks: Record<string, Tile[]>,
  tileBag: Tile[],
): GameState {
  const radius = radiusForPlayerCount(playerIds.length)
  const scores: Record<string, Record<Color, number>> = {}
  for (const pid of playerIds) {
    scores[pid] = emptyScores()
  }

  return {
    lobbyId,
    status: 'in_progress',
    board: {},
    tileBag,
    playerRacks: initialRacks,
    scores,
    currentPlayerId: playerIds[0],
    playerOrder: playerIds,
    bonusTurnsOwed: 0,
    moveCount: 0,
    winner: null,
    firstTurnPlayersRemaining: [...playerIds],
    usedStartSymbols: [],
    radius,
  }
}
