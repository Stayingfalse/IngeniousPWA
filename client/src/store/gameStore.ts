import { create } from 'zustand'
import type { MaskedGameState, Tile, Color, GameResults, AxialCoord } from '@ingenious/shared'
import { scoreRays, dirBetween } from '@ingenious/shared'

export type ScoringAnimation = {
  rayHexes: Array<{ color: Color; cells: Array<{ coord: AxialCoord; delayMs: number }> }>
  floatingLabels: Array<{ color: Color; points: number; hex: AxialCoord }>
  flashColors: Set<Color>
  startedAt: number
}

interface GameStore {
  gameState: MaskedGameState | null
  myRack: Tile[]
  selectedTileIndex: number | null
  tileFlipped: boolean
  lastIngenious: { playerId: string; color: Color } | null
  gameOver: GameResults | null
  scoringAnimation: ScoringAnimation | null
  setGameState: (state: MaskedGameState) => void
  setMyRack: (rack: Tile[]) => void
  selectTile: (index: number | null) => void
  flipTile: () => void
  setIngenious: (playerId: string, color: Color) => void
  clearIngenious: () => void
  setGameOver: (results: GameResults) => void
  reset: () => void
}

let scoringAnimationTimer: ReturnType<typeof setTimeout> | null = null

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  myRack: [],
  selectedTileIndex: null,
  tileFlipped: false,
  lastIngenious: null,
  gameOver: null,
  scoringAnimation: null,

  setGameState: (state) => {
    let scoringAnimation: ScoringAnimation | null = null

    if (state.lastMove) {
      const { hexA, hexB, colorA, colorB, scoreDelta } = state.lastMove
      const board = state.board

      const dirAtoB = dirBetween(hexA, hexB)
      const dirBtoA = dirBetween(hexB, hexA)

      const raysA = scoreRays(hexA, colorA, board, dirAtoB)
      const raysB = scoreRays(hexB, colorB, board, dirBtoA)

      const rayHexes: ScoringAnimation['rayHexes'] = []

      for (const ray of raysA) {
        rayHexes.push({
          color: colorA,
          cells: ray.cells.map((coord, i) => ({ coord, delayMs: i * 60 })),
        })
      }
      for (const ray of raysB) {
        rayHexes.push({
          color: colorB,
          cells: ray.cells.map((coord, i) => ({ coord, delayMs: i * 60 })),
        })
      }

      const floatingLabels: ScoringAnimation['floatingLabels'] = []
      if (colorA === colorB) {
        // Same-color tile: scoreDelta is the combined total; show one label
        if (scoreDelta[colorA] > 0) {
          floatingLabels.push({ color: colorA, points: scoreDelta[colorA], hex: hexA })
        }
      } else {
        if (scoreDelta[colorA] > 0) {
          floatingLabels.push({ color: colorA, points: scoreDelta[colorA], hex: hexA })
        }
        if (scoreDelta[colorB] > 0) {
          floatingLabels.push({ color: colorB, points: scoreDelta[colorB], hex: hexB })
        }
      }

      const flashColors = new Set<Color>(
        (Object.entries(scoreDelta) as Array<[Color, number]>)
          .filter(([, pts]) => pts > 0)
          .map(([c]) => c),
      )

      scoringAnimation = { rayHexes, floatingLabels, flashColors, startedAt: Date.now() }

      if (scoringAnimationTimer !== null) clearTimeout(scoringAnimationTimer)
      scoringAnimationTimer = setTimeout(() => {
        useGameStore.setState({ scoringAnimation: null })
        scoringAnimationTimer = null
      }, 2000)
    }

    set({ gameState: state, myRack: state.myRack, scoringAnimation })
  },

  setMyRack: (rack) => set({ myRack: rack }),

  selectTile: (index) => set({ selectedTileIndex: index, tileFlipped: false }),

  flipTile: () => set(s => ({ tileFlipped: !s.tileFlipped })),

  setIngenious: (playerId, color) =>
    set({ lastIngenious: { playerId, color } }),

  clearIngenious: () => set({ lastIngenious: null }),

  setGameOver: (results) => set({ gameOver: results }),

  reset: () => {
    if (scoringAnimationTimer !== null) {
      clearTimeout(scoringAnimationTimer)
      scoringAnimationTimer = null
    }
    set({
      gameState: null,
      myRack: [],
      selectedTileIndex: null,
      tileFlipped: false,
      lastIngenious: null,
      gameOver: null,
      scoringAnimation: null,
    })
  },
}))
