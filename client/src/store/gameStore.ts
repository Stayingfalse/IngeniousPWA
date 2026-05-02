import { create } from 'zustand'
import type { MaskedGameState, Tile, Color, GameResults } from '@ingenious/shared'

interface GameStore {
  gameState: MaskedGameState | null
  myRack: Tile[]
  selectedTileIndex: number | null
  tileFlipped: boolean
  lastIngenious: { playerId: string; color: Color } | null
  gameOver: GameResults | null
  setGameState: (state: MaskedGameState) => void
  setMyRack: (rack: Tile[]) => void
  selectTile: (index: number | null) => void
  flipTile: () => void
  setIngenious: (playerId: string, color: Color) => void
  clearIngenious: () => void
  setGameOver: (results: GameResults) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  myRack: [],
  selectedTileIndex: null,
  tileFlipped: false,
  lastIngenious: null,
  gameOver: null,

  setGameState: (state) =>
    set({ gameState: state, myRack: state.myRack }),

  setMyRack: (rack) => set({ myRack: rack }),

  selectTile: (index) => set({ selectedTileIndex: index, tileFlipped: false }),

  flipTile: () => set(s => ({ tileFlipped: !s.tileFlipped })),

  setIngenious: (playerId, color) =>
    set({ lastIngenious: { playerId, color } }),

  clearIngenious: () => set({ lastIngenious: null }),

  setGameOver: (results) => set({ gameOver: results }),

  reset: () => set({
    gameState: null,
    myRack: [],
    selectedTileIndex: null,
    tileFlipped: false,
    lastIngenious: null,
    gameOver: null,
  }),
}))
