import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useLobbyStore } from './store/lobbyStore'
import { useGameStore } from './store/gameStore'
import HomeScreen from './components/screens/HomeScreen'
import LobbyScreen from './components/screens/LobbyScreen'
import GameScreen from './components/screens/GameScreen'
import type { ServerMessage } from '@ingenious/shared'
import { wsClient } from './lib/wsClient'

type Screen = 'home' | 'lobby' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const { setMyPlayer, setLobby, playerJoined, playerLeft, lobbyId, myPlayerName } = useLobbyStore()
  const { setGameState, setMyRack, setIngenious, setGameOver } = useGameStore()

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'JOINED':
        setMyPlayer(msg.playerId, '')
        setLobby(
          msg.lobbyState.id,
          msg.lobbyState,
          msg.seat,
        )
        // If a game is already in progress (mid-game reconnect), go straight to the game screen
        setScreen(msg.lobbyState.status === 'in_progress' ? 'game' : 'lobby')
        break

      case 'PLAYER_JOINED':
        playerJoined(msg.player)
        break

      case 'PLAYER_LEFT':
        playerLeft(msg.playerId)
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
        break

      case 'ERROR':
        console.error('[WS Error]', msg.code, msg.message)
        break
    }
  }, [setMyPlayer, setLobby, playerJoined, playerLeft, setGameState, setMyRack, setIngenious, setGameOver])

  const { connected } = useWebSocket(handleMessage)

  // Auto re-join lobby/game when WebSocket reconnects
  const prevConnectedRef = useRef(false)
  useEffect(() => {
    const wasDisconnected = !prevConnectedRef.current
    const nowConnected = connected
    const shouldReconnect = nowConnected && wasDisconnected && !!lobbyId && screen !== 'home'
    if (shouldReconnect) {
      wsClient.send({ type: 'JOIN_LOBBY', lobbyId, playerName: myPlayerName || 'Player' })
    }
    prevConnectedRef.current = connected
  }, [connected, lobbyId, myPlayerName, screen])

  return (
    <div className="min-h-screen bg-[#0f0e17] text-white">
      {!connected && (
        <div className="fixed top-2 right-2 bg-red-800 text-white text-xs px-3 py-1 rounded-full z-50">
          Reconnecting…
        </div>
      )}
      {screen === 'home' && <HomeScreen />}
      {screen === 'lobby' && <LobbyScreen onNavigate={setScreen} />}
      {screen === 'game' && <GameScreen />}
    </div>
  )
}
