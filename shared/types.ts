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
}

export type PlayerInfo = {
  id: string
  name: string
  seat: number
}

export type TurnMode = 'realtime' | 'async'

export type LobbyState = {
  id: string
  status: GameStatus
  players: PlayerInfo[]
  maxPlayers: number
  hostId: string
  turnMode: TurnMode
  turnLimitSeconds: number | null
}

export type GameResults = {
  winner: string | null
  scores: Record<string, Record<Color, number>>
  reason: 'all_eighteen' | 'no_moves'
}

export type ClientMessage =
  | { type: 'JOIN_LOBBY'; lobbyId: string; playerName: string }
  | { type: 'START_GAME' }
  | { type: 'PLACE_TILE'; tileIndex: number; hexA: AxialCoord; hexB: AxialCoord }
  | { type: 'SWAP_RACK' }
  | { type: 'CHANGE_NAME'; name: string }
  | { type: 'REQUEST_SYNC' }
  | { type: 'PING' }

export type ServerMessage =
  | { type: 'JOINED'; playerId: string; seat: number; lobbyState: LobbyState }
  | { type: 'PLAYER_JOINED'; player: PlayerInfo }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'PLAYER_NAME_CHANGED'; playerId: string; name: string }
  | { type: 'GAME_STARTED'; state: MaskedGameState }
  | { type: 'STATE_UPDATE'; state: MaskedGameState }
  | { type: 'INGENIOUS'; playerId: string; color: Color }
  | { type: 'YOUR_NEW_RACK'; rack: Tile[] }
  | { type: 'GAME_OVER'; results: GameResults }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' }
