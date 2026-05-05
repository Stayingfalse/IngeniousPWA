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
  vsComputerGames: number
  currentWinStreak: number
  bestWinStreak: number
  mostCommonOpponentName: string | null
  mostCommonOpponentGames: number
}

export type GlobalStats = {
  totalGames: number
  realtimeGames: number
  asyncGames: number
  vsComputerGames: number
  wonByAllEighteen: number
  wonByNoMoves: number
  wonByForfeit: number
  aiWinsEasy: number
  aiTotalEasy: number
  aiWinsMedium: number
  aiTotalMedium: number
  aiWinsHard: number
  aiTotalHard: number
}

export type PlayerHistoryEntry = {
  id: string
  lobbyId: string
  won: boolean
  winnerName: string | null
  winReason: 'all_eighteen' | 'no_moves' | 'forfeit' | null
  opponentNames: string[]
  moveCount: number
  durationSeconds: number
  finishedAt: number
  turnMode: TurnMode | null
  aiDifficulty: AiDifficulty | null
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
