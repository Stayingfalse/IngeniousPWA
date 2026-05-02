import type { Color } from './types'
import type { AxialCoord } from './hexGrid'
import { HEX_DIRS, key, add, dirBetween } from './hexGrid'
import { COLORS } from './tileBag'
export { COLORS }

/**
 * Score a single hex by tracing rays in up to 5 directions.
 * excludeDir: the direction toward the partner hex (skip this direction).
 * Returns total count of consecutive same-color hexes found across all rays.
 */
export function scoreHex(
  coord: AxialCoord,
  color: Color,
  board: Record<string, Color>,
  excludeDir: AxialCoord | null,
): number {
  let total = 0

  for (const dir of HEX_DIRS) {
    // Skip the direction toward the partner hex
    if (excludeDir && dir.q === excludeDir.q && dir.r === excludeDir.r) {
      continue
    }

    // Trace ray in this direction
    let pos = add(coord, dir)
    while (board[key(pos)] === color) {
      total++
      pos = add(pos, dir)
    }
  }

  return total
}

/**
 * Score a full tile placement (both hexes).
 * Returns a map of color -> points scored by this move.
 */
export function scoreMove(
  hexA: AxialCoord,
  hexB: AxialCoord,
  colorA: Color,
  colorB: Color,
  board: Record<string, Color>,
): Record<Color, number> {
  const result: Record<Color, number> = {
    red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0,
  }

  // Direction from A to B and B to A
  const dirAtoB = dirBetween(hexA, hexB)
  const dirBtoA = dirBetween(hexB, hexA)

  // Score hexA: trace 5 rays (exclude direction toward hexB)
  const scoreA = scoreHex(hexA, colorA, board, dirAtoB)
  result[colorA] += scoreA

  // Score hexB: trace 5 rays (exclude direction toward hexA)
  const scoreB = scoreHex(hexB, colorB, board, dirBtoA)
  result[colorB] += scoreB

  return result
}

export function emptyScores(): Record<Color, number> {
  return { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
}

export function addScores(
  a: Record<Color, number>,
  b: Record<Color, number>,
): Record<Color, number> {
  const result = { ...a }
  for (const color of COLORS) {
    result[color] = Math.min(18, (result[color] || 0) + (b[color] || 0))
  }
  return result
}

export function minScore(scores: Record<Color, number>): number {
  return Math.min(...COLORS.map(c => scores[c] || 0))
}
