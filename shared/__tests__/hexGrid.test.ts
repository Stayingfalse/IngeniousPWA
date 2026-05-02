import { describe, it, expect } from 'vitest'
import {
  key, add, hexDist, isAdjacent, inBounds, allHexes, startSymbolPositions, HEX_DIRS, dirBetween,
} from '../hexGrid'

describe('hexGrid', () => {
  describe('key', () => {
    it('generates string key from coord', () => {
      expect(key({ q: 1, r: 2 })).toBe('1,2')
      expect(key({ q: -3, r: 0 })).toBe('-3,0')
    })
  })

  describe('add', () => {
    it('adds two axial coords', () => {
      expect(add({ q: 1, r: 2 }, { q: 3, r: 4 })).toEqual({ q: 4, r: 6 })
      expect(add({ q: -1, r: 1 }, { q: 1, r: -1 })).toEqual({ q: 0, r: 0 })
    })
  })

  describe('hexDist', () => {
    it('returns 0 for same hex', () => {
      expect(hexDist({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0)
    })
    it('returns 1 for adjacent hexes', () => {
      expect(hexDist({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1)
      expect(hexDist({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1)
      expect(hexDist({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1)
    })
    it('returns 2 for two steps away', () => {
      expect(hexDist({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2)
      expect(hexDist({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(2)
    })
  })

  describe('isAdjacent', () => {
    it('returns true for neighbors', () => {
      expect(isAdjacent({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(true)
      expect(isAdjacent({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(true)
    })
    it('returns false for non-adjacent', () => {
      expect(isAdjacent({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false)
      expect(isAdjacent({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(false)
    })
  })

  describe('inBounds', () => {
    it('center is always in bounds', () => {
      expect(inBounds({ q: 0, r: 0 }, 6)).toBe(true)
    })
    it('corners are in bounds', () => {
      expect(inBounds({ q: 6, r: 0 }, 6)).toBe(true)
      expect(inBounds({ q: -6, r: 0 }, 6)).toBe(true)
      expect(inBounds({ q: 0, r: 6 }, 6)).toBe(true)
      expect(inBounds({ q: 6, r: -6 }, 6)).toBe(true)
    })
    it('out of bounds hexes fail', () => {
      expect(inBounds({ q: 7, r: 0 }, 6)).toBe(false)
      expect(inBounds({ q: 4, r: 4 }, 6)).toBe(false)
    })
  })

  describe('allHexes', () => {
    it('radius 1 has 7 hexes', () => {
      expect(allHexes(1).length).toBe(7)
    })
    it('radius 2 has 19 hexes', () => {
      expect(allHexes(2).length).toBe(19)
    })
    it('radius 6 has 127 hexes', () => {
      expect(allHexes(6).length).toBe(127)
    })
  })

  describe('startSymbolPositions', () => {
    it('returns 6 positions for radius 6', () => {
      const positions = startSymbolPositions(6)
      expect(positions.length).toBe(6)
    })
    it('all start positions are on the board edge', () => {
      const radius = 6
      const positions = startSymbolPositions(radius)
      for (const pos of positions) {
        expect(inBounds(pos, radius)).toBe(true)
        // At least one axis is at max
        const isEdge = Math.abs(pos.q) === radius || Math.abs(pos.r) === radius || Math.abs(pos.q + pos.r) === radius
        expect(isEdge).toBe(true)
      }
    })
  })

  describe('dirBetween', () => {
    it('returns direction from a to b', () => {
      expect(dirBetween({ q: 0, r: 0 }, { q: 1, r: 0 })).toEqual({ q: 1, r: 0 })
      expect(dirBetween({ q: 2, r: 1 }, { q: 1, r: 2 })).toEqual({ q: -1, r: 1 })
    })
  })
})
