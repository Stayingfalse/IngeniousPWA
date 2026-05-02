import { describe, it, expect } from 'vitest'
import { createTileBag, drawTiles } from '../tileBag'
import type { Tile } from '../types'

describe('tileBag', () => {
  describe('createTileBag', () => {
    it('creates exactly 120 tiles', () => {
      const bag = createTileBag()
      expect(bag.length).toBe(120)
    })

    it('has 5 copies of each same-color double', () => {
      const bag = createTileBag()
      const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
      for (const color of colors) {
        const count = bag.filter(t => t.colorA === color && t.colorB === color).length
        expect(count).toBe(5)
      }
    })

    it('has 6 copies of each unique mixed pair', () => {
      const bag = createTileBag()
      const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const count = bag.filter(
            t =>
              (t.colorA === colors[i] && t.colorB === colors[j]) ||
              (t.colorA === colors[j] && t.colorB === colors[i]),
          ).length
          expect(count).toBe(6)
        }
      }
    })
  })

  describe('drawTiles', () => {
    it('draws specified number of tiles', () => {
      const bag = createTileBag()
      const { drawn, remaining } = drawTiles(bag, 6)
      expect(drawn.length).toBe(6)
      expect(remaining.length).toBe(114)
    })

    it('draws all remaining tiles if count exceeds bag size', () => {
      const smallBag: Tile[] = [
        { colorA: 'red', colorB: 'blue' },
        { colorA: 'green', colorB: 'yellow' },
      ]
      const { drawn, remaining } = drawTiles(smallBag, 10)
      expect(drawn.length).toBe(2)
      expect(remaining.length).toBe(0)
    })

    it('returns empty drawn array for empty bag', () => {
      const { drawn, remaining } = drawTiles([], 3)
      expect(drawn.length).toBe(0)
      expect(remaining.length).toBe(0)
    })
  })
})
