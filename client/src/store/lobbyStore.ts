import { create } from 'zustand'
import type { LobbyState, PlayerInfo, ActiveGameSummary } from '@ingenious/shared'

interface LobbyStore {
  lobbyId: string | null
  lobbyState: LobbyState | null
  myPlayerId: string | null
  myPlayerName: string
  mySeat: number | null
  activeGames: ActiveGameSummary[]
  setMyPlayer: (id: string, name: string) => void
  setLobby: (lobbyId: string, state: LobbyState, seat: number) => void
  updateLobbyState: (state: LobbyState) => void
  playerJoined: (player: PlayerInfo) => void
  playerLeft: (playerId: string) => void
  playerNameChanged: (playerId: string, name: string) => void
  setActiveGames: (games: ActiveGameSummary[]) => void
  reset: () => void
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  lobbyId: null,
  lobbyState: null,
  myPlayerId: null,
  myPlayerName: '',
  mySeat: null,
  activeGames: [],

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

  playerNameChanged: (playerId, name) =>
    set(s => {
      if (!s.lobbyState) return s
      return {
        myPlayerName: s.myPlayerId === playerId ? name : s.myPlayerName,
        lobbyState: {
          ...s.lobbyState,
          players: s.lobbyState.players.map(p =>
            p.id === playerId ? { ...p, name } : p
          ),
        },
      }
    }),

  setActiveGames: (games) => set({ activeGames: games }),

  reset: () => set({ lobbyId: null, lobbyState: null, mySeat: null }),
}))
