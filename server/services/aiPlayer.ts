import type { GameState, AxialCoord, AiDifficulty } from '@ingenious/shared'
import { getLegalPlacements, applyMove, COLORS } from '@ingenious/shared'

export const AI_PLAYER_ID = 'ai-computer-player'
export const AI_PLAYER_NAME = 'Computer'

/**
 * Choose a random legal move (Easy difficulty).
 */
function chooseRandomMove(
  state: GameState,
  playerId: string,
): { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null {
  const rack = state.playerRacks[playerId]
  if (!rack || rack.length === 0) return null

  const isFirstMove = state.firstTurnPlayersRemaining.includes(playerId)
  const placements = getLegalPlacements(
    state.board,
    state.radius,
    isFirstMove,
    state.usedStartSymbols,
  )
  if (placements.length === 0) return null

  const tileIndex = Math.floor(Math.random() * rack.length)
  const placement = placements[Math.floor(Math.random() * placements.length)]
  return { tileIndex, hexA: placement.hexA, hexB: placement.hexB }
}

/**
 * Choose the best move by maximising total score (Medium difficulty).
 */
function chooseMediumMove(
  state: GameState,
  playerId: string,
): { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null {
  const rack = state.playerRacks[playerId]
  if (!rack || rack.length === 0) return null

  const isFirstMove = state.firstTurnPlayersRemaining.includes(playerId)
  const placements = getLegalPlacements(
    state.board,
    state.radius,
    isFirstMove,
    state.usedStartSymbols,
  )
  if (placements.length === 0) return null

  let bestMove: { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null = null
  let bestTotalScore = -Infinity

  const seenTileTypes = new Set<string>()
  for (let tileIndex = 0; tileIndex < rack.length; tileIndex++) {
    const tile = rack[tileIndex]
    const tileKey = `${tile.colorA}-${tile.colorB}`
    if (seenTileTypes.has(tileKey)) continue
    seenTileTypes.add(tileKey)

    for (const { hexA, hexB } of placements) {
      try {
        const { newState } = applyMove(state, playerId, tileIndex, hexA, hexB)
        const scores = newState.scores[playerId]
        const totalScore = COLORS.reduce((s, c) => s + (scores[c] ?? 0), 0)

        if (totalScore > bestTotalScore) {
          bestTotalScore = totalScore
          bestMove = { tileIndex, hexA, hexB }
        }
      } catch {
        // Skip illegal placements
      }
    }
  }

  return bestMove
}

/**
 * Choose the best move for the AI player using a greedy strategy:
 * maximise the AI's minimum score across all colours (Hard difficulty).
 * Ties broken by total score.
 */
function chooseHardMove(
  state: GameState,
  playerId: string,
): { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null {
  const rack = state.playerRacks[playerId]
  if (!rack || rack.length === 0) return null

  const isFirstMove = state.firstTurnPlayersRemaining.includes(playerId)
  const placements = getLegalPlacements(
    state.board,
    state.radius,
    isFirstMove,
    state.usedStartSymbols,
  )
  if (placements.length === 0) return null

  let bestMove: { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null = null
  let bestMinScore = -Infinity
  let bestTotalScore = -Infinity

  // Deduplicate tiles by (colorA, colorB) to avoid redundant evaluation
  const seenTileTypes = new Set<string>()
  for (let tileIndex = 0; tileIndex < rack.length; tileIndex++) {
    const tile = rack[tileIndex]
    const tileKey = `${tile.colorA}-${tile.colorB}`
    if (seenTileTypes.has(tileKey)) continue
    seenTileTypes.add(tileKey)

    for (const { hexA, hexB } of placements) {
      try {
        const { newState } = applyMove(state, playerId, tileIndex, hexA, hexB)
        const scores = newState.scores[playerId]
        const minScore = Math.min(...COLORS.map(c => scores[c] ?? 0))
        const totalScore = COLORS.reduce((s, c) => s + (scores[c] ?? 0), 0)

        if (
          minScore > bestMinScore ||
          (minScore === bestMinScore && totalScore > bestTotalScore)
        ) {
          bestMinScore = minScore
          bestTotalScore = totalScore
          bestMove = { tileIndex, hexA, hexB }
        }
      } catch {
        // Skip illegal placements
      }
    }
  }

  return bestMove
}

/**
 * Choose a move for the AI player based on the selected difficulty.
 */
export function chooseBestMove(
  state: GameState,
  playerId: string,
  difficulty: AiDifficulty = 'hard',
): { tileIndex: number; hexA: AxialCoord; hexB: AxialCoord } | null {
  switch (difficulty) {
    case 'easy':
      return chooseRandomMove(state, playerId)
    case 'medium':
      return chooseMediumMove(state, playerId)
    case 'hard':
    default:
      return chooseHardMove(state, playerId)
  }
}
