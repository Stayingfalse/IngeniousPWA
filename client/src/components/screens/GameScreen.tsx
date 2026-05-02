import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useLobbyStore } from '../../store/lobbyStore'
import HexBoard from '../board/HexBoard'
import PlayerRack from '../ui/PlayerRack'
import ScorePanel from '../ui/ScorePanel'
import TurnIndicator from '../ui/TurnIndicator'
import GameOverModal from '../ui/GameOverModal'
import IngeniousBanner from '../ui/IngeniousBanner'
import { wsClient } from '../../lib/wsClient'
import type { AxialCoord, Color } from '@ingenious/shared'
import { findMinColor } from '@ingenious/shared'
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed,
} from '../../lib/pushNotifications'

const COLOR_LABELS: Record<Color, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple',
}

export default function GameScreen() {
  const { gameState, myRack, selectedTileIndex, tileFlipped, selectTile, flipTile, gameOver } = useGameStore()
  const { myPlayerId, lobbyState } = useLobbyStore()

  const isMyTurn = gameState?.currentPlayerId === myPlayerId
  const isFirstMove = myPlayerId ? (gameState?.firstTurnPlayersRemaining ?? []).includes(myPlayerId) : false
  const usedStartSymbols = gameState?.usedStartSymbols ?? []
  const isAsyncMode = lobbyState?.turnMode === 'async'

  // Rack-swap eligibility prompt
  const [showSwapPrompt, setShowSwapPrompt] = useState(false)
  const swapPromptShownForTurn = useRef<string | null>(null)

  useEffect(() => {
    if (!isMyTurn || !myPlayerId || !gameState) {
      setShowSwapPrompt(false)
      return
    }
    const turnKey = `${myPlayerId}-${gameState.moveCount}`
    if (swapPromptShownForTurn.current === turnKey) return
    swapPromptShownForTurn.current = turnKey

    const scores = gameState.scores[myPlayerId]
    if (!scores) return
    const minColor = findMinColor(scores)
    const hasMinColor = myRack.some(t => t.colorA === minColor || t.colorB === minColor)
    if (!hasMinColor && myRack.length > 0) {
      setShowSwapPrompt(true)
    }
  }, [isMyTurn, myPlayerId, gameState, myRack])

  // Turn countdown (realtime mode only)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!gameState?.turnDeadline || isAsyncMode) {
      setSecondsLeft(null)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.round((gameState.turnDeadline! - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [gameState?.turnDeadline, isAsyncMode])

  // Push notification opt-in (async mode)
  const [pushPermission, setPushPermission] = useState(getNotificationPermission)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    if (!isAsyncMode || !isPushSupported()) return
    void isSubscribed().then(setPushSubscribed)
  }, [isAsyncMode])

  const handleEnableNotifications = async () => {
    setPushLoading(true)
    const result = await subscribeToPush()
    setPushPermission(result)
    if (result === 'granted') {
      setPushSubscribed(true)
    }
    setPushLoading(false)
  }

  const handleDisableNotifications = async () => {
    setPushLoading(true)
    await unsubscribeFromPush()
    setPushSubscribed(false)
    setPushLoading(false)
  }

  const handleHexClick = (_coord: AxialCoord) => {
    if (!isMyTurn || selectedTileIndex === null) return
  }

  const handleTilePlaced = (tileIndex: number, hexA: AxialCoord, hexB: AxialCoord) => {
    const [a, b] = tileFlipped ? [hexB, hexA] : [hexA, hexB]
    wsClient.send({ type: 'PLACE_TILE', tileIndex, hexA: a, hexB: b })
    selectTile(null)
    setShowSwapPrompt(false)
  }

  const handleSwapRack = () => {
    wsClient.send({ type: 'SWAP_RACK' })
    setShowSwapPrompt(false)
  }

  const handleDeclineSwap = () => {
    setShowSwapPrompt(false)
  }

  const playerNames = Object.fromEntries(
    lobbyState?.players.map(p => [p.id, p.name]) ?? []
  )

  const timerColor = secondsLeft !== null && secondsLeft <= 10
    ? 'text-red-400'
    : secondsLeft !== null && secondsLeft <= 20
      ? 'text-yellow-400'
      : 'text-gray-400'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1833] border-b border-[#312e6b]">
        <IngeniousBanner small />
        <TurnIndicator
          currentPlayerId={gameState?.currentPlayerId ?? ''}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
        />
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {/* Real-time countdown */}
          {secondsLeft !== null && !isAsyncMode && (
            <span className={`font-mono font-bold ${timerColor}`} title="Time left for this turn">
              {secondsLeft}s
            </span>
          )}
          {/* Async mode badge */}
          {isAsyncMode && (
            <span className="text-blue-400 text-xs" title="Turn-based game — no time limit">
              ☁ Turn-based
            </span>
          )}
          {/* Push notification toggle (async only) */}
          {isAsyncMode && isPushSupported() && pushPermission !== 'denied' && (
            <button
              onClick={pushSubscribed ? handleDisableNotifications : handleEnableNotifications}
              disabled={pushLoading}
              title={pushSubscribed ? 'Disable turn notifications' : 'Enable turn notifications'}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                pushSubscribed
                  ? 'border-blue-500 text-blue-400 hover:border-red-400 hover:text-red-400'
                  : 'border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-400'
              } ${pushLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {pushSubscribed ? '🔔 On' : '🔕 Notify'}
            </button>
          )}
          <span>{gameState?.tileBagCount ?? 0} tiles left</span>
        </div>
      </div>

      {/* Rack swap eligibility prompt */}
      {showSwapPrompt && (() => {
        const scores = gameState?.scores[myPlayerId ?? '']
        const minColor = scores ? findMinColor(scores) : null
        return (
          <div className="bg-amber-900/80 border-b border-amber-600 px-4 py-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-amber-200">
              Your rack has no <strong>{minColor ? COLOR_LABELS[minColor] : ''}</strong> tiles (your lowest colour). You may swap your rack.
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleSwapRack}
                className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded text-xs font-medium"
              >
                Swap Rack
              </button>
              <button
                onClick={handleDeclineSwap}
                className="text-amber-300 hover:text-white px-2 py-1 text-xs"
              >
                Keep &amp; Play
              </button>
            </div>
          </div>
        )
      })()}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-2">
          <HexBoard
            board={gameState?.board ?? {}}
            radius={gameState?.radius ?? 6}
            myRack={myRack}
            selectedTileIndex={selectedTileIndex}
            tileFlipped={tileFlipped}
            isMyTurn={isMyTurn}
            isFirstMove={isFirstMove}
            usedStartSymbols={usedStartSymbols}
            onTilePlaced={handleTilePlaced}
          />
        </div>

        {/* Right panel */}
        <div className="w-48 lg:w-64 flex flex-col gap-2 p-2 overflow-y-auto">
          <ScorePanel
            scores={gameState?.scores ?? {}}
            playerOrder={gameState?.playerOrder ?? []}
            myPlayerId={myPlayerId ?? ''}
            playerNames={playerNames}
            currentPlayerId={gameState?.currentPlayerId ?? ''}
          />
        </div>
      </div>

      {/* Bottom: player rack */}
      <div className="bg-[#1a1833] border-t border-[#312e6b] p-3">
        <PlayerRack
          tiles={myRack}
          selectedIndex={selectedTileIndex}
          tileFlipped={tileFlipped}
          onSelect={selectTile}
          onFlip={flipTile}
          isMyTurn={isMyTurn}
          onSwap={handleSwapRack}
        />
      </div>

      {gameOver && (
        <GameOverModal
          results={gameOver}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
          onClose={() => useGameStore.getState().reset()}
        />
      )}
    </div>
  )
}
