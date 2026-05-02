import type { Tile } from './types'
import type { Color } from './types'

export const COLORS: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

export function createTileBag(): Tile[] {
  const tiles: Tile[] = []

  // 5 copies of each same-color double
  for (const color of COLORS) {
    for (let i = 0; i < 5; i++) {
      tiles.push({ colorA: color, colorB: color })
    }
  }

  // 6 copies of each unique mixed pair
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      for (let k = 0; k < 6; k++) {
        tiles.push({ colorA: COLORS[i], colorB: COLORS[j] })
      }
    }
  }

  // Total: 6*5 + 15*6 = 30 + 90 = 120
  return shuffle(tiles)
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function drawTiles(bag: Tile[], count: number): { drawn: Tile[]; remaining: Tile[] } {
  const remaining = [...bag]
  const drawn: Tile[] = []
  for (let i = 0; i < count && remaining.length > 0; i++) {
    drawn.push(remaining.pop()!)
  }
  return { drawn, remaining }
}
