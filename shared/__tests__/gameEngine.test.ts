import { describe, it, expect } from 'vitest'
import {
  isLegalPlacement,
  getLegalPlacements,
  checkWinCondition,
  applyMove,
  initGameState,
  radiusForPlayerCount,
  determineWinnerByScore,
} from '../gameEngine'
import { startSymbolPositions, key } from '../hexGrid'
import type { GameState, Color, Tile } from '../types'
import { emptyScores } from '../scoring'

function makeTile(colorA: Color, colorB: Color): Tile {
  return { colorA, colorB }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const radius = 6
  const players = ['p1', 'p2']
  const scores: Record<string, Record<Color, number>> = {
    p1: emptyScores(),
    p2: emptyScores(),
  }
  return {
    lobbyId: 'test',
    status: 'in_progress',
    board: {},
    tileBag: [],
    playerRacks: {
      p1: [makeTile('red', 'blue'), makeTile('green', 'yellow')],
      p2: [makeTile('orange', 'purple')],
    },
    scores,
    currentPlayerId: 'p1',
    playerOrder: players,
    bonusTurnsOwed: 0,
    moveCount: 0,
    winner: null,
    firstTurnPlayersRemaining: [...players],
    usedStartSymbols: [],
    radius,
    ...overrides,
  }
}

describe('gameEngine', () => {
  describe('radiusForPlayerCount', () => {
    it('returns 6 for 2 players', () => {
      expect(radiusForPlayerCount(2)).toBe(6)
    })
    it('returns 7 for 3 players', () => {
      expect(radiusForPlayerCount(3)).toBe(7)
    })
    it('returns 8 for 4 players', () => {
      expect(radiusForPlayerCount(4)).toBe(8)
    })
  })

  describe('isLegalPlacement', () => {
    const radius = 6
    const starts = startSymbolPositions(radius)

    it('rejects out-of-bounds placements', () => {
      expect(
        isLegalPlacement({ q: 7, r: 0 }, { q: 6, r: 0 }, {}, radius, false, []),
      ).toBe(false)
    })

    it('rejects non-adjacent hexes', () => {
      expect(
        isLegalPlacement({ q: 0, r: 0 }, { q: 2, r: 0 }, {}, radius, false, []),
      ).toBe(false)
    })

    it('rejects occupied hexes', () => {
      const board: Record<string, Color> = { '0,0': 'red' }
      expect(
        isLegalPlacement({ q: 0, r: 0 }, { q: 1, r: 0 }, board, radius, false, []),
      ).toBe(false)
    })

    it('accepts valid non-first-move placement', () => {
      expect(
        isLegalPlacement({ q: 0, r: 0 }, { q: 1, r: 0 }, {}, radius, false, []),
      ).toBe(true)
    })

    it('requires adjacency to start symbol on first move', () => {
      // Far from any start symbol
      expect(
        isLegalPlacement({ q: 0, r: 0 }, { q: 1, r: 0 }, {}, radius, true, []),
      ).toBe(false)
    })

    it('accepts placement adjacent to start symbol on first move', () => {
      // Place adjacent to first start symbol
      const start = starts[0] // e.g., {q:6, r:0}
      const neighbor = { q: start.q - 1, r: start.r }
      const neighbor2 = { q: start.q - 1, r: start.r + 1 }
      expect(
        isLegalPlacement(neighbor, neighbor2, {}, radius, true, []),
      ).toBe(true)
    })

    it('rejects first move adjacent only to used start symbol', () => {
      const start = starts[0]
      const neighbor = { q: start.q - 1, r: start.r }
      const neighbor2 = { q: start.q - 1, r: start.r + 1 }
      const usedSymbols = [key(start)]
      expect(
        isLegalPlacement(neighbor, neighbor2, {}, radius, true, usedSymbols),
      ).toBe(false)
    })
  })

  describe('getLegalPlacements', () => {
    it('returns placements adjacent to start symbols on first move', () => {
      const radius = 6
      const placements = getLegalPlacements({}, radius, true, [])
      expect(placements.length).toBeGreaterThan(0)
      // All placements should be near start symbols
    })

    it('returns more placements after first move', () => {
      const radius = 6
      const firstMovePlacements = getLegalPlacements({}, radius, true, [])
      const allPlacements = getLegalPlacements({}, radius, false, [])
      expect(allPlacements.length).toBeGreaterThan(firstMovePlacements.length)
    })
  })

  describe('checkWinCondition', () => {
    it('returns null when no player has all 18s', () => {
      const state = makeState()
      expect(checkWinCondition(state)).toBeNull()
    })

    it('returns player id when player has all 18s', () => {
      const state = makeState({
        scores: {
          p1: { red: 18, orange: 18, yellow: 18, green: 18, blue: 18, purple: 18 },
          p2: emptyScores(),
        },
      })
      expect(checkWinCondition(state)).toBe('p1')
    })
  })

  describe('applyMove', () => {
    it('throws on wrong player turn', () => {
      const state = makeState({ currentPlayerId: 'p2' })
      const starts = startSymbolPositions(6)
      const start = starts[0]
      expect(() =>
        applyMove(state, 'p1', 0, { q: start.q - 1, r: start.r }, start),
      ).toThrow('NOT_YOUR_TURN')
    })

    it('throws on invalid tile index', () => {
      const state = makeState({ firstTurnPlayersRemaining: [] })
      expect(() =>
        applyMove(state, 'p1', 99, { q: 0, r: 0 }, { q: 1, r: 0 }),
      ).toThrow('INVALID_TILE_INDEX')
    })

    it('places tile and updates board', () => {
      const state = makeState({ firstTurnPlayersRemaining: [] })
      const { newState } = applyMove(state, 'p1', 0, { q: 0, r: 0 }, { q: 1, r: 0 })
      expect(newState.board['0,0']).toBe('red')
      expect(newState.board['1,0']).toBe('blue')
    })

    it('removes tile from rack after placement', () => {
      const state = makeState({ firstTurnPlayersRemaining: [] })
      const { newState } = applyMove(state, 'p1', 0, { q: 0, r: 0 }, { q: 1, r: 0 })
      expect(newState.playerRacks['p1'].length).toBe(1)
    })
  })

  describe('determineWinnerByScore', () => {
    it('returns player with highest minimum score', () => {
      const state = makeState({
        scores: {
          p1: { red: 5, orange: 5, yellow: 5, green: 5, blue: 5, purple: 5 },
          p2: { red: 3, orange: 3, yellow: 3, green: 3, blue: 3, purple: 3 },
        },
      })
      expect(determineWinnerByScore(state)).toBe('p1')
    })
  })
})
