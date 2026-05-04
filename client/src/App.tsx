import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useLobbyStore } from './store/lobbyStore'
import { useGameStore } from './store/gameStore'
import HomeScreen from './components/screens/HomeScreen'
import LobbyScreen from './components/screens/LobbyScreen'
import GameScreen from './components/screens/GameScreen'
import type { ServerMessage, ActiveGameSummary } from '@ingenious/shared'
import { wsClient } from './lib/wsClient'

type Screen = 'home' | 'lobby' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [authReady, setAuthReady] = useState(false)
  const { setMyPlayer, setLobby, playerJoined, playerLeft, playerNameChanged, lobbyId, myPlayerName, setActiveGames, activeGames } = useLobbyStore()
  const { setGameState, setMyRack, setIngenious, setGameOver } = useGameStore()

  const fetchActiveGames = useCallback(() => {
    fetch('/api/player/games', { credentials: 'include' })
      .then(res => res.ok ? res.json() : { games: [] })
      .then((data: { games?: ActiveGameSummary[] }) => {
        if (data?.games) setActiveGames(data.games)
      })
      .catch(() => {})
  }, [setActiveGames])

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'JOINED': {
        const joinedName = msg.lobbyState.players.find(p => p.id === msg.playerId)?.name ?? ''
        setMyPlayer(msg.playerId, joinedName)
        setLobby(
          msg.lobbyState.id,
          msg.lobbyState,
          msg.seat,
        )
        // Only save lastLobbyId for realtime games (async games are tracked via the API)
        if (msg.lobbyState.turnMode === 'realtime') {
          localStorage.setItem('lastLobbyId', msg.lobbyState.id)
        }
        // Clear any error message on successful join
        setErrorMessage('')
        // If a game is already in progress (mid-game reconnect), go straight to the game screen
        setScreen(msg.lobbyState.status === 'in_progress' ? 'game' : 'lobby')
        break
      }

      case 'PLAYER_JOINED':
        playerJoined(msg.player)
        break

      case 'PLAYER_LEFT':
        playerLeft(msg.playerId)
        break

      case 'PLAYER_NAME_CHANGED':
        playerNameChanged(msg.playerId, msg.name)
        break

      case 'GAME_STARTED':
        setGameState(msg.state)
        setMyRack(msg.state.myRack)
        setScreen('game')
        break

      case 'STATE_UPDATE':
        setGameState(msg.state)
        break

      case 'YOUR_NEW_RACK':
        setMyRack(msg.rack)
        break

      case 'INGENIOUS':
        setIngenious(msg.playerId, msg.color)
        setTimeout(() => useGameStore.getState().clearIngenious(), 3000)
        break

      case 'GAME_OVER':
        setGameOver(msg.results)
        // Clear saved realtime lobby ID when game is over
        localStorage.removeItem('lastLobbyId')
        break

      case 'ERROR':
        console.error('[WS Error]', msg.code, msg.message)
        // Display error to user based on error code
        if (msg.code === 'LOBBY_NOT_FOUND') {
          setErrorMessage('Lobby not found. It may have been closed.')
          localStorage.removeItem('lastLobbyId')
        } else if (msg.code === 'GAME_ALREADY_STARTED') {
          setErrorMessage('This game has already started and you are not a player. Spectating is not yet available.')
        } else {
          setErrorMessage(msg.message || 'An error occurred')
        }
        break
    }
  }, [setMyPlayer, setLobby, playerJoined, playerLeft, playerNameChanged, setGameState, setMyRack, setIngenious, setGameOver])

  const { connected } = useWebSocket(handleMessage, authReady)

  // Ensure player_token cookie is established on mount so HTTP API calls succeed
  useEffect(() => {
    fetch('/api/auth', { method: 'POST', credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then((data: { playerId?: string; playerName?: string } | null) => {
        if (data?.playerId && data.playerName !== undefined) {
          setMyPlayer(data.playerId, data.playerName)
        }
      })
      .catch((err) => console.warn('[Auth] Initialization failed:', err))
      .finally(() => {
        setAuthReady(true)
        fetchActiveGames()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto re-join lobby/game when WebSocket reconnects OR on initial mount if saved lobby exists
  const prevConnectedRef = useRef(false)
  const hasAttemptedAutoRejoin = useRef(false)
  useEffect(() => {
    const wasDisconnected = !prevConnectedRef.current
    const nowConnected = connected

    if (nowConnected && wasDisconnected && !!lobbyId && screen !== 'home') {
      // WS reconnected while viewing a specific game — rejoin it
      const savedName = localStorage.getItem('playerName')
      const name = myPlayerName || savedName || 'Player'
      wsClient.send({ type: 'JOIN_LOBBY', lobbyId, playerName: name })
    } else if (nowConnected && !hasAttemptedAutoRejoin.current && screen === 'home') {
      hasAttemptedAutoRejoin.current = true
      // First connect: only auto-join realtime games (async games are shown in the list)
      const savedLobbyId = localStorage.getItem('lastLobbyId')
      if (savedLobbyId) {
        const savedName = localStorage.getItem('playerName')
        const name = myPlayerName || savedName || 'Player'
        wsClient.send({ type: 'JOIN_LOBBY', lobbyId: savedLobbyId, playerName: name })
      }
    }
    prevConnectedRef.current = connected
  }, [connected, lobbyId, myPlayerName, screen])

  /** Enter a specific async game from the home screen game list. */
  const handleEnterGame = useCallback((targetLobbyId: string) => {
    useGameStore.getState().reset()
    const savedName = localStorage.getItem('playerName')
    const name = myPlayerName || savedName || 'Player'
    wsClient.send({ type: 'JOIN_LOBBY', lobbyId: targetLobbyId, playerName: name })
  }, [myPlayerName])

  const handleNavigateHome = () => {
    const currentTurnMode = useLobbyStore.getState().lobbyState?.turnMode
    useGameStore.getState().reset()
    if (currentTurnMode === 'async') {
      // For async games, keep the lobby state (player is still in the game).
      // Just go back to home and refresh the active games list.
      fetchActiveGames()
    } else {
      // For realtime games, fully reset and clear the saved lobby.
      useLobbyStore.getState().reset()
      localStorage.removeItem('lastLobbyId')
    }
    setScreen('home')
  }

  return (
    <div className="min-h-screen bg-[#0f0e17] text-white">
      {!connected && (
        <div className="fixed top-2 right-2 bg-red-800 text-white text-xs px-3 py-1 rounded-full z-50">
          Reconnecting…
        </div>
      )}
      {screen === 'home' && (
        <HomeScreen
          globalError={errorMessage}
          activeGames={activeGames}
          onEnterGame={handleEnterGame}
        />
      )}
      {screen === 'lobby' && <LobbyScreen onNavigate={setScreen} />}
      {screen === 'game' && <GameScreen onNavigateHome={handleNavigateHome} />}
    </div>
  )
}
