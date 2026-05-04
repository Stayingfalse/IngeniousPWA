import type { GameState, AxialCoord } from '@ingenious/shared'
import { getLegalPlacements, applyMove, COLORS } from '@ingenious/shared'

export const AI_PLAYER_ID = 'ai-computer-player'
export const AI_PLAYER_NAME = 'Computer'

/**
 * Choose the best move for the AI player using a greedy strategy:
 * maximise the AI's minimum score across all colours. Ties broken by total score.
 */
export function chooseBestMove(
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
