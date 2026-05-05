import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useLobbyStore } from './store/lobbyStore'
import { useGameStore } from './store/gameStore'
import HomeScreen from './components/screens/HomeScreen'
import LobbyScreen from './components/screens/LobbyScreen'
import GameScreen from './components/screens/GameScreen'
import type { ServerMessage, ActiveGameSummary, OpenLobbySummary } from '@ingenious/shared'
import { wsClient } from './lib/wsClient'

type Screen = 'home' | 'lobby' | 'game'

/** How often (ms) to refresh the active-games list while on the home screen. */
const ACTIVE_GAMES_POLL_INTERVAL_MS = 30_000

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [authReady, setAuthReady] = useState(false)
  const { setMyPlayer, setLobby, playerJoined, playerLeft, playerNameChanged, lobbyId, myPlayerName, myPlayerId, setActiveGames, activeGames, startSpectating, spectatorJoined, spectatorLeft, setOpenLobbies, openLobbies, updateLobbyState } = useLobbyStore()
  const { setGameState, setMyRack, setIngenious, setGameOver } = useGameStore()

  const fetchActiveGames = useCallback(() => {
    fetch('/api/player/games', { credentials: 'include' })
      .then(res => res.ok ? res.json() : { games: [] })
      .then((data: { games?: ActiveGameSummary[] }) => {
        if (data?.games) setActiveGames(data.games)
      })
      .catch((err) => console.warn('[ActiveGames] Failed to fetch active games:', err))
  }, [setActiveGames])

  const fetchOpenLobbies = useCallback(() => {
    fetch('/api/player/lobbies', { credentials: 'include' })
      .then(res => res.ok ? res.json() : { lobbies: [] })
      .then((data: { lobbies?: OpenLobbySummary[] }) => {
        if (data?.lobbies) setOpenLobbies(data.lobbies)
      })
      .catch((err) => console.warn('[OpenLobbies] Failed to fetch open lobbies:', err))
  }, [setOpenLobbies])

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

      case 'SPECTATING': {
        // Non-participant viewing an in-progress game
        startSpectating(msg.lobbyState)
        setGameState(msg.state)
        setErrorMessage('')
        setScreen('game')
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

      case 'PLAYER_FORFEITED':
        // The following STATE_UPDATE will carry the updated forfeitedPlayerIds;
        // no additional client state change needed here.
        break

      case 'SPECTATOR_JOINED':
        spectatorJoined(msg.spectator)
        break

      case 'SPECTATOR_LEFT':
        spectatorLeft(msg.spectatorId)
        break

      case 'LOBBY_STATE_UPDATED':
        updateLobbyState(msg.lobbyState)
        break

      case 'PLAYER_KICKED':
        // This player has been removed from the lobby/game by the host
        useGameStore.getState().reset()
        useLobbyStore.getState().reset()
        localStorage.removeItem('lastLobbyId')
        setErrorMessage('You have been removed from the lobby by the host.')
        setScreen('home')
        break

      case 'LOBBY_CLOSED':
        // The host deleted the lobby
        useGameStore.getState().reset()
        useLobbyStore.getState().reset()
        localStorage.removeItem('lastLobbyId')
        setErrorMessage('The lobby was closed by the host.')
        setScreen('home')
        break

      case 'ERROR':
        console.error('[WS Error]', msg.code, msg.message)
        // Display error to user based on error code
        if (msg.code === 'LOBBY_NOT_FOUND') {
          setErrorMessage('Lobby not found. It may have been closed.')
          localStorage.removeItem('lastLobbyId')
        } else if (msg.code === 'GAME_ALREADY_STARTED') {
          setErrorMessage('This game has already ended or is no longer available to join.')
        } else {
          setErrorMessage(msg.message || 'An error occurred')
        }
        break
    }
  }, [setMyPlayer, setLobby, playerJoined, playerLeft, playerNameChanged, setGameState, setMyRack, setIngenious, setGameOver, spectatorJoined, spectatorLeft, updateLobbyState])

  const { connected } = useWebSocket(handleMessage, authReady)

  // Capture ?join= or /<CODE> URL param on first mount so we can auto-navigate once connected.
  // We clear it from the URL immediately to prevent HomeScreen from also reading it.
  const pendingJoinFromUrlRef = useRef<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryCode = params.get('join')
    const pathMatch = /^\/([A-Z0-9]{6})$/i.exec(window.location.pathname)
    const pendingLobbyId = queryCode ?? pathMatch?.[1] ?? null
    if (pendingLobbyId) {
      pendingJoinFromUrlRef.current = pendingLobbyId.toUpperCase().trim()
      // Normalise the URL back to '/' so the address bar is clean
      window.history.replaceState(null, '', '/')
    }
  }, [])

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
        fetchOpenLobbies()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh active games and open lobbies periodically while on the home screen so the
  // lists update when it becomes the player's turn or a lobby fills up.
  useEffect(() => {
    if (screen !== 'home') return
    const id = setInterval(() => {
      fetchActiveGames()
      fetchOpenLobbies()
    }, ACTIVE_GAMES_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [screen, fetchActiveGames, fetchOpenLobbies])

  /** Enter a specific async game from the home screen game list. */
  const handleEnterGame = useCallback((targetLobbyId: string) => {
    useGameStore.getState().reset()
    const savedName = localStorage.getItem('playerName')
    const name = myPlayerName || savedName || 'Player'
    wsClient.send({ type: 'JOIN_LOBBY', lobbyId: targetLobbyId, playerName: name })
  }, [myPlayerName])

  /** Enter an open (waiting) async lobby from the home screen. */
  const handleEnterOpenLobby = useCallback((targetLobbyId: string) => {
    useGameStore.getState().reset()
    const savedName = localStorage.getItem('playerName')
    const name = myPlayerName || savedName || 'Player'
    wsClient.send({ type: 'JOIN_LOBBY', lobbyId: targetLobbyId, playerName: name })
  }, [myPlayerName])

  /** Delete an open (waiting) async lobby from the home screen. */
  const handleDeleteOpenLobby = useCallback(async (targetLobbyId: string) => {
    try {
      const res = await fetch(`/api/lobbies/${targetLobbyId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        // Refresh the open lobbies list
        fetchOpenLobbies()
      } else {
        const data = await res.json() as { error?: string }
        setErrorMessage(data.error || 'Failed to delete lobby')
      }
    } catch {
      setErrorMessage('Network error')
    }
  }, [fetchOpenLobbies])

  // Listen for messages posted by the service worker
  // an existing window) and navigate straight to the referenced game.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; lobbyId?: string } | null
      if (data?.type === 'NAVIGATE_TO_GAME' && data.lobbyId) {
        handleEnterGame(data.lobbyId)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [handleEnterGame])

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
      // Prefer a lobby ID from the notification/invite URL, then fall back to
      // the saved realtime lobby ID.
      const pendingLobbyId = pendingJoinFromUrlRef.current
      pendingJoinFromUrlRef.current = null
      const savedLobbyId = pendingLobbyId ?? localStorage.getItem('lastLobbyId')
      if (savedLobbyId) {
        const savedName = localStorage.getItem('playerName')
        const name = myPlayerName || savedName || 'Player'
        wsClient.send({ type: 'JOIN_LOBBY', lobbyId: savedLobbyId, playerName: name })
      }
    }
    prevConnectedRef.current = connected
  }, [connected, lobbyId, myPlayerName, screen])

  // Keep the address bar in sync with the current screen/lobby so players
  // can copy a shareable link directly from the URL bar at any time.
  //   • lobby or game screen  →  /<lobbyId>  (e.g. /ELCCQP)
  //   • home screen           →  /
  useEffect(() => {
    if (screen !== 'home' && lobbyId) {
      window.history.replaceState(null, '', `/${lobbyId}`)
    } else if (screen === 'home') {
      window.history.replaceState(null, '', '/')
    }
  }, [screen, lobbyId])

  const handleNavigateHome = () => {
    const { lobbyState: currentLobbyState, isSpectating } = useLobbyStore.getState()
    const currentTurnMode = currentLobbyState?.turnMode
    const currentStatus = currentLobbyState?.status
    useGameStore.getState().reset()
    if (!isSpectating && currentTurnMode === 'async') {
      // For async games/lobbies, keep the lobby state (player is still a member).
      // Refresh both lists so the home screen shows up-to-date info.
      fetchActiveGames()
      fetchOpenLobbies()
    } else if (!isSpectating && currentStatus === 'waiting' && currentTurnMode !== 'async') {
      // Leaving a realtime waiting lobby returns home and fully resets
      useLobbyStore.getState().reset()
      localStorage.removeItem('lastLobbyId')
    } else {
      // For realtime games and spectators, fully reset and clear the saved lobby.
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
          openLobbies={openLobbies}
          onEnterGame={handleEnterGame}
          onEnterOpenLobby={handleEnterOpenLobby}
          onDeleteOpenLobby={handleDeleteOpenLobby}
          playerId={myPlayerId}
        />
      )}
      {screen === 'lobby' && <LobbyScreen onNavigate={setScreen} />}
      {screen === 'game' && <GameScreen onNavigateHome={handleNavigateHome} />}
    </div>
  )
}
