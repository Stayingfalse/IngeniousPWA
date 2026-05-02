import type { AxialCoord } from './types'
export type { AxialCoord }

// Flat-top hex directions (6 neighbors)
export const HEX_DIRS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export function key(c: AxialCoord): string {
  return `${c.q},${c.r}`
}

export function add(a: AxialCoord, b: AxialCoord): AxialCoord {
  return { q: a.q + b.q, r: a.r + b.r }
}

export function neg(a: AxialCoord): AxialCoord {
  return { q: -a.q, r: -a.r }
}

export function hexDist(a: AxialCoord, b: AxialCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
}

export function isAdjacent(a: AxialCoord, b: AxialCoord): boolean {
  return hexDist(a, b) === 1
}

export function inBounds(c: AxialCoord, radius: number): boolean {
  return Math.abs(c.q) <= radius && Math.abs(c.r) <= radius && Math.abs(c.q + c.r) <= radius
}

export function allHexes(radius: number): AxialCoord[] {
  const hexes: AxialCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) <= radius) {
        hexes.push({ q, r })
      }
    }
  }
  return hexes
}

// The 6 corner positions of the hexagonal board at a given radius
export function startSymbolPositions(radius: number): AxialCoord[] {
  return [
    { q: radius, r: 0 },
    { q: radius, r: -radius },
    { q: 0, r: -radius },
    { q: -radius, r: 0 },
    { q: -radius, r: radius },
    { q: 0, r: radius },
  ]
}

// Direction between two adjacent hexes (a -> b)
export function dirBetween(a: AxialCoord, b: AxialCoord): AxialCoord {
  return { q: b.q - a.q, r: b.r - a.r }
}
