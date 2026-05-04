export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'
export type AxialCoord = { q: number; r: number }
export type Tile = { colorA: Color; colorB: Color }

export type GameStatus = 'waiting' | 'in_progress' | 'finished'

export type GameState = {
  lobbyId: string
  status: GameStatus
  board: Record<string, Color>
  tileBag: Tile[]
  playerRacks: Record<string, Tile[]>
  scores: Record<string, Record<Color, number>>
  currentPlayerId: string
  playerOrder: string[]
  bonusTurnsOwed: number
  moveCount: number
  winner: string | null
  firstTurnPlayersRemaining: string[]
  usedStartSymbols: string[]
  radius: number
  forfeitedPlayerIds: string[]
}

export type LastMove = {
  hexA: AxialCoord
  hexB: AxialCoord
  colorA: Color
  colorB: Color
  scoreDelta: Record<Color, number>
}

export type MaskedGameState = Omit<GameState, 'tileBag' | 'playerRacks'> & {
  tileBagCount: number
  myRack: Tile[]
  otherRackSizes: Record<string, number>
  turnDeadline: number | null
  lastMove?: LastMove
  swapAvailable?: boolean
  /** True when the receiving client is watching as a spectator, not a participant. */
  isSpectator?: boolean
}

export type PlayerInfo = {
  id: string
  name: string
  seat: number
  isAI?: boolean
}

export type TurnMode = 'realtime' | 'async'

export type AiDifficulty = 'easy' | 'medium' | 'hard'

export type SpectatorInfo = {
  id: string
  name: string
}

export type LobbyState = {
  id: string
  status: GameStatus
  players: PlayerInfo[]
  maxPlayers: number
  hostId: string
  turnMode: TurnMode
  turnLimitSeconds: number | null
  spectators?: SpectatorInfo[]
  autoStart?: boolean
  tournamentId?: string
  matchId?: string
}

export type OpenLobbySummary = {
  lobbyId: string
  maxPlayers: number
  players: PlayerInfo[]
  autoStart: boolean
}

export type GameResults = {
  winner: string | null
  scores: Record<string, Record<Color, number>>
  reason: 'all_eighteen' | 'no_moves' | 'forfeit'
}

export type ActiveGameSummary = {
  lobbyId: string
  turnMode: TurnMode
  currentPlayerId: string
  yourTurn: boolean
  players: PlayerInfo[]
}

export type PlayerStats = {
  gamesPlayed: number
  gamesWon: number
  uniqueOpponents: number
}

export type GlobalStats = {
  totalGames: number
  realtimeGames: number
  asyncGames: number
  wonByAllEighteen: number
  wonByNoMoves: number
  wonByForfeit: number
}

export type ClientMessage =
  | { type: 'JOIN_LOBBY'; lobbyId: string; playerName: string }
  | { type: 'START_GAME' }
  | { type: 'PLACE_TILE'; tileIndex: number; hexA: AxialCoord; hexB: AxialCoord }
  | { type: 'SWAP_RACK' }
  | { type: 'DECLINE_SWAP' }
  | { type: 'CHANGE_NAME'; name: string }
  | { type: 'REQUEST_SYNC' }
  | { type: 'FORFEIT_GAME' }
  | { type: 'SET_AUTO_START'; enabled: boolean }
  | { type: 'KICK_PLAYER'; targetPlayerId: string }
  | { type: 'PING' }
  | { type: 'CREATE_TOURNAMENT'; format: TournamentFormat; maxPlayers: number; turnMode: TurnMode; turnLimitSeconds: number | null }
  | { type: 'JOIN_TOURNAMENT'; tournamentId: string; playerName: string }
  | { type: 'START_TOURNAMENT' }
  | { type: 'FORFEIT_GAME_ONLY' }
  | { type: 'FORFEIT_TOURNAMENT' }

export type ServerMessage =
  | { type: 'JOINED'; playerId: string; seat: number; lobbyState: LobbyState }
  | { type: 'SPECTATING'; state: MaskedGameState; lobbyState: LobbyState }
  | { type: 'PLAYER_JOINED'; player: PlayerInfo }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'PLAYER_NAME_CHANGED'; playerId: string; name: string }
  | { type: 'GAME_STARTED'; state: MaskedGameState }
  | { type: 'STATE_UPDATE'; state: MaskedGameState }
  | { type: 'INGENIOUS'; playerId: string; color: Color }
  | { type: 'YOUR_NEW_RACK'; rack: Tile[] }
  | { type: 'GAME_OVER'; results: GameResults }
  | { type: 'PLAYER_FORFEITED'; playerId: string }
  | { type: 'SPECTATOR_JOINED'; spectator: SpectatorInfo }
  | { type: 'SPECTATOR_LEFT'; spectatorId: string }
  | { type: 'LOBBY_STATE_UPDATED'; lobbyState: LobbyState }
  | { type: 'PLAYER_KICKED' }
  | { type: 'LOBBY_CLOSED' }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' }
  | { type: 'TOURNAMENT_JOINED'; tournamentId: string; state: TournamentState }
  | { type: 'TOURNAMENT_STATE'; state: TournamentState }
  | { type: 'TOURNAMENT_ROUND_STARTED'; roundNumber: number; myMatchId: string | null; myLobbyId: string | null }
  | { type: 'TOURNAMENT_FINISHED'; finalStandings: TournamentStanding[] }
  | { type: 'FORFEIT_CHOICE_REQUESTED' }

export type TournamentFormat = 'round_robin' | 'swiss'
export type TournamentStatus = 'registering' | 'in_progress' | 'finished'

export type TournamentStanding = {
  playerId: string
  playerName: string
  wins: number
  losses: number
  gamesPlayed: number
  cumulativeMinScore: number
  cumulativeTotalScore: number
  eliminated: boolean
}

export type TournamentPlayerScore = {
  minScore: number
  totalScore: number
}

export type TournamentMatch = {
  matchId: string
  lobbyId: string | null
  roundNumber: number
  playerIds: string[]
  status: 'pending' | 'active' | 'finished'
  winnerId: string | null
  playerScores: Record<string, TournamentPlayerScore>
}

export type TournamentRound = {
  roundNumber: number
  matches: TournamentMatch[]
  status: 'pending' | 'active' | 'done'
}

export type TournamentState = {
  id: string
  hostId: string
  format: TournamentFormat
  status: TournamentStatus
  maxPlayers: number
  totalRounds: number
  turnMode: TurnMode
  turnLimitSeconds: number | null
  players: PlayerInfo[]
  rounds: TournamentRound[]
  standings: TournamentStanding[]
  currentRound: number
}

export type TournamentSummary = {
  id: string
  format: TournamentFormat
  status: TournamentStatus
  maxPlayers: number
  playerCount: number
  currentRound: number
  totalRounds: number
}
