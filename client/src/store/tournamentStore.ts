import { create } from 'zustand'
import type { TournamentState, TournamentStanding } from '@ingenious/shared'

interface TournamentStore {
  tournamentId: string | null
  tournamentState: TournamentState | null
  myMatchId: string | null
  myLobbyId: string | null
  finalStandings: TournamentStanding[] | null
  setTournament: (id: string, state: TournamentState) => void
  updateTournamentState: (state: TournamentState) => void
  setRoundStarted: (roundNumber: number, myMatchId: string | null, myLobbyId: string | null) => void
  setFinalStandings: (standings: TournamentStanding[]) => void
  reset: () => void
}

export const useTournamentStore = create<TournamentStore>((set) => ({
  tournamentId: null,
  tournamentState: null,
  myMatchId: null,
  myLobbyId: null,
  finalStandings: null,

  setTournament: (id, state) => set({ tournamentId: id, tournamentState: state }),

  updateTournamentState: (state) => set({ tournamentState: state }),

  setRoundStarted: (roundNumber, myMatchId, myLobbyId) =>
    set(s => ({
      myMatchId,
      myLobbyId,
      tournamentState: s.tournamentState
        ? { ...s.tournamentState, currentRound: roundNumber }
        : s.tournamentState,
    })),

  setFinalStandings: (standings) => set({ finalStandings: standings }),

  reset: () => set({
    tournamentId: null,
    tournamentState: null,
    myMatchId: null,
    myLobbyId: null,
    finalStandings: null,
  }),
}))
