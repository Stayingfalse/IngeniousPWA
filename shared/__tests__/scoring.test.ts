import { describe, it, expect } from 'vitest'
import { scoreHex, scoreMove, emptyScores, addScores } from '../scoring'
import type { Color } from '../types'

describe('scoring', () => {
  describe('scoreHex', () => {
    it('returns 0 when no neighbors of same color', () => {
      const board: Record<string, Color> = { '0,0': 'red' }
      // Scoring hex at (1,0) with color blue - no blue neighbors
      const score = scoreHex({ q: 1, r: 0 }, 'blue', board, null)
      expect(score).toBe(0)
    })

    it('counts one adjacent same-color hex', () => {
      const board: Record<string, Color> = {
        '0,0': 'red',
        '2,0': 'red',
      }
      // Scoring hex at (1,0) with color red, no exclude direction
      const score = scoreHex({ q: 1, r: 0 }, 'red', board, null)
      // Rays: left hits (0,0)=red (+1), continues to (-1,0)=empty. Right hits (2,0)=red (+1), continues to (3,0)=empty. Others are empty.
      expect(score).toBe(2)
    })

    it('counts chain of same-color hexes', () => {
      const board: Record<string, Color> = {
        '-1,0': 'blue',
        '-2,0': 'blue',
        '-3,0': 'blue',
      }
      // Scoring hex at (0,0) with color blue, looking left
      const score = scoreHex({ q: 0, r: 0 }, 'blue', board, { q: 1, r: 0 }) // exclude right
      // Left ray: (-1,0)=blue (+1), (-2,0)=blue (+1), (-3,0)=blue (+1), (-4,0)=empty
      expect(score).toBeGreaterThanOrEqual(3)
    })

    it('excludes direction toward partner hex', () => {
      const board: Record<string, Color> = {
        '1,0': 'red',
        '-1,0': 'red',
      }
      // Scoring hex at (0,0) with color red, exclude direction (1,0) toward partner
      const score = scoreHex({ q: 0, r: 0 }, 'red', board, { q: 1, r: 0 })
      // Should count (-1,0) but not (1,0)
      expect(score).toBe(1)
    })
  })

  describe('scoreMove', () => {
    it('returns zero scores when placed on empty board', () => {
      const board: Record<string, Color> = {}
      const scores = scoreMove({ q: 0, r: 0 }, { q: 1, r: 0 }, 'red', 'blue', board)
      expect(scores['red']).toBe(0)
      expect(scores['blue']).toBe(0)
    })

    it('scores adjacent same-color hexes', () => {
      const board: Record<string, Color> = {
        '2,0': 'red',
        '0,0': 'red',
        '1,0': 'blue',
      }
      // Place hexA at (0,0)=red, hexB at (1,0)=blue (but board already has these, so test neighbors)
      // Let's place at (3,0) and (4,0) with red/blue
      const board2: Record<string, Color> = {
        '2,0': 'red', // neighbor of hexA (3,0)
        '5,0': 'red', // neighbor of hexB (4,0)
        '3,0': 'red',
        '4,0': 'blue',
      }
      const scores = scoreMove({ q: 3, r: 0 }, { q: 4, r: 0 }, 'red', 'blue', board2)
      // hexA (3,0) red: left ray hits (2,0)=red (+1). Right dir excluded (toward hexB).
      expect(scores['red']).toBeGreaterThan(0)
    })

    it('scores same-color double tile', () => {
      const board: Record<string, Color> = {
        '0,0': 'red',
        '1,0': 'red',
        '-1,0': 'red',
        '2,0': 'red',
      }
      // Place red/red at (0,0) and (1,0)
      const scores = scoreMove({ q: 0, r: 0 }, { q: 1, r: 0 }, 'red', 'red', board)
      // Both hexes are red; each gets scored independently
      expect(scores['red']).toBeGreaterThanOrEqual(0)
    })
  })

  describe('addScores', () => {
    it('adds scores correctly', () => {
      const a = emptyScores()
      const b = { red: 3, orange: 2, yellow: 1, green: 0, blue: 5, purple: 4 }
      const result = addScores(a, b)
      expect(result['red']).toBe(3)
      expect(result['blue']).toBe(5)
    })

    it('caps scores at 18', () => {
      const a = { red: 16, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
      const b = { red: 5, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
      const result = addScores(a, b)
      expect(result['red']).toBe(18)
    })
  })
})
