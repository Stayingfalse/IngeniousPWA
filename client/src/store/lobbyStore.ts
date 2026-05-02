import { create } from 'zustand'
import type { LobbyState, PlayerInfo } from '@ingenious/shared'

interface LobbyStore {
  lobbyId: string | null
  lobbyState: LobbyState | null
  myPlayerId: string | null
  myPlayerName: string
  mySeat: number | null
  setMyPlayer: (id: string, name: string) => void
  setLobby: (lobbyId: string, state: LobbyState, seat: number) => void
  updateLobbyState: (state: LobbyState) => void
  playerJoined: (player: PlayerInfo) => void
  playerLeft: (playerId: string) => void
  reset: () => void
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  lobbyId: null,
  lobbyState: null,
  myPlayerId: null,
  myPlayerName: '',
  mySeat: null,

  setMyPlayer: (id, name) => set({ myPlayerId: id, myPlayerName: name }),

  setLobby: (lobbyId, state, seat) =>
    set({ lobbyId, lobbyState: state, mySeat: seat }),

  updateLobbyState: (state) => set({ lobbyState: state }),

  playerJoined: (player) =>
    set(s => {
      if (!s.lobbyState) return s
      const existing = s.lobbyState.players.find(p => p.id === player.id)
      if (existing) return s
      return {
        lobbyState: {
          ...s.lobbyState,
          players: [...s.lobbyState.players, player],
        },
      }
    }),

  playerLeft: (playerId) =>
    set(s => {
      if (!s.lobbyState) return s
      return {
        lobbyState: {
          ...s.lobbyState,
          players: s.lobbyState.players.filter(p => p.id !== playerId),
        },
      }
    }),

  reset: () => set({ lobbyId: null, lobbyState: null, mySeat: null }),
}))
