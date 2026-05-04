import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useLobbyStore } from '../../store/lobbyStore'
import HexBoard from '../board/HexBoard'
import PlayerRack from '../ui/PlayerRack'
import ScorePanel from '../ui/ScorePanel'
import TurnIndicator from '../ui/TurnIndicator'
import GameOverModal from '../ui/GameOverModal'
import IngeniousBanner from '../ui/IngeniousBanner'
import TutorialOverlay from '../ui/TutorialOverlay'
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
import { useColourBlindMode } from '../../hooks/useColourBlindMode'

const COLOR_LABELS: Record<Color, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple',
}

const INGENIOUS_COLOR_HEX: Record<Color, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

const INGENIOUS_ANIMATION_DURATION_MS = 3000
const TURN_ANIMATION_DURATION_MS = 2500

export default function GameScreen({ onNavigateHome }: { onNavigateHome: () => void }) {
  const { gameState, myRack, selectedTileIndex, tileFlipped, selectTile, flipTile, gameOver, lastIngenious, scoringAnimation } = useGameStore()
  const { myPlayerId, lobbyState, isSpectating } = useLobbyStore()

  const [colourBlindMode, toggleColourBlindMode] = useColourBlindMode()

  const isMyTurn = !isSpectating && gameState?.currentPlayerId === myPlayerId
  const isFirstMove = myPlayerId ? (gameState?.firstTurnPlayersRemaining ?? []).includes(myPlayerId) : false
  const usedStartSymbols = gameState?.usedStartSymbols ?? []
  const isAsyncMode = lobbyState?.turnMode === 'async'
  const isVsAI = lobbyState?.players.some(p => p.isAI) ?? false

  // Show tutorial for first-time players
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('hasSeenTutorial'))

  // Swap prompt is driven by server-side swapAvailable flag (end-of-turn check)
  const showSwapPrompt = !!gameState?.swapAvailable

  // Turn / Ingenious notification overlay
  const [showTurnNotification, setShowTurnNotification] = useState(false)
  const [turnNotificationKey, setTurnNotificationKey] = useState(0)
  const prevMoveCountRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isMyTurn || !gameState) return
    const moveCount = gameState.moveCount
    // Initialize ref on first encounter without triggering a notification
    if (prevMoveCountRef.current === null) {
      prevMoveCountRef.current = moveCount
      return
    }
    if (moveCount === prevMoveCountRef.current) return
    prevMoveCountRef.current = moveCount
    // Only show "Your Turn" if there's no ingenious notification showing
    if (!lastIngenious) {
      setTurnNotificationKey(k => k + 1)
      setShowTurnNotification(true)
      const id = setTimeout(() => setShowTurnNotification(false), TURN_ANIMATION_DURATION_MS)
      return () => clearTimeout(id)
    }
  }, [isMyTurn, gameState, lastIngenious])

  // Turn countdown (realtime mode only)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!gameState?.turnDeadline || isAsyncMode || showTutorial) {
      setSecondsLeft(null)
      return
    }
    const update = () => {
      const deadline = gameState?.turnDeadline
      if (deadline === null || deadline === undefined) {
        setSecondsLeft(null)
        return
      }
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [gameState?.turnDeadline, isAsyncMode, showTutorial])

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

  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false)

  const handleForfeit = () => {
    wsClient.send({ type: 'FORFEIT_GAME' })
    setShowForfeitConfirm(false)
    onNavigateHome()
  }

  const handleTilePlaced = (tileIndex: number, hexA: AxialCoord, hexB: AxialCoord) => {
    const [a, b] = tileFlipped ? [hexB, hexA] : [hexA, hexB]
    wsClient.send({ type: 'PLACE_TILE', tileIndex, hexA: a, hexB: b })
    selectTile(null)
  }

  const handleSwapRack = () => {
    wsClient.send({ type: 'SWAP_RACK' })
  }

  const handleDeclineSwap = () => {
    wsClient.send({ type: 'DECLINE_SWAP' })
  }

  const playerNames = Object.fromEntries(
    lobbyState?.players.map(p => [p.id, p.name]) ?? []
  )

  const timerColor = secondsLeft !== null && secondsLeft <= 10
    ? 'text-red-300 bg-red-900/60 animate-pulse rounded px-1.5 py-0.5'
    : secondsLeft !== null && secondsLeft <= 20
      ? 'text-yellow-400'
      : 'text-gray-400'

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1833] border-b border-[#312e6b]">
        <div className="flex items-center gap-2">
          {isAsyncMode && (
            <button
              onClick={onNavigateHome}
              className="text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10"
              title="Return to games list"
            >
              ← All Games
            </button>
          )}
          <IngeniousBanner small />
        </div>
        <TurnIndicator
          currentPlayerId={gameState?.currentPlayerId ?? ''}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
        />
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {/* Spectator badge */}
          {isSpectating && (
            <span className="text-sky-400 font-medium flex items-center gap-1" title="You are watching this game as a spectator">
              👁 Spectating
            </span>
          )}
          {/* Real-time countdown */}
          {secondsLeft !== null && !isAsyncMode && (
            <span className={`font-mono font-bold ${timerColor}`} title="Time left for this turn">
              {secondsLeft}s
            </span>
          )}
          {/* Async mode badge */}
          {isAsyncMode && !isSpectating && (
            <span className="text-blue-400 text-xs" title={isVsAI ? 'vs Computer — no time limit' : 'Turn-based game — no time limit'}>
              {isVsAI ? '🤖 Computer' : '☁ Turn-based'}
            </span>
          )}
          {/* Push notification toggle (async only, players only) */}
          {isAsyncMode && !isSpectating && isPushSupported() && pushPermission !== 'denied' && (
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
          {/* Colour Blind Mode toggle */}
          <button
            onClick={toggleColourBlindMode}
            title={colourBlindMode ? 'Disable Colour Blind Mode' : 'Enable Colour Blind Mode'}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              colourBlindMode
                ? 'border-yellow-400 text-yellow-300 hover:border-yellow-300'
                : 'border-gray-600 text-gray-400 hover:border-yellow-400 hover:text-yellow-300'
            }`}
          >
            {colourBlindMode ? '◑ CBM' : '◑'}
          </button>
          {/* Spectators get a plain Leave button; players get the forfeit-confirm flow */}
          {isSpectating ? (
            <button
              onClick={onNavigateHome}
              title="Stop spectating"
              className="text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
            >
              Leave
            </button>
          ) : (
            <button
              onClick={() => setShowForfeitConfirm(true)}
              title="Leave and forfeit this game"
              className="text-xs px-2 py-0.5 rounded border border-red-900 text-red-400 hover:border-red-500 hover:text-red-300 transition-colors"
            >
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Rack swap eligibility prompt — players only */}
      {showSwapPrompt && !isSpectating && (() => {
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
                Keep & Play
              </button>
            </div>
          </div>
        )
      })()}

      {/* Main content - responsive layout based on orientation */}
      {/* Portrait mode: Board on top (full width), Scoreboard below, Rack at bottom */}
      {/* Landscape mode: Rack on left, Board in center (full height), Scoreboard on right */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col portrait:flex-col landscape:flex-row">
        {/* Tile rack — hidden for spectators */}
        {!isSpectating && (
        <div className="order-3 portrait:order-3 landscape:order-1 portrait:shrink-0 bg-[#1a1833] border-t portrait:border-t landscape:border-t-0 landscape:border-r border-[#312e6b] portrait:p-2 landscape:p-2 landscape:w-32 landscape:flex landscape:items-center landscape:overflow-y-auto">
          <PlayerRack
            tiles={myRack}
            selectedIndex={selectedTileIndex}
            tileFlipped={tileFlipped}
            onSelect={selectTile}
            onFlip={flipTile}
            isMyTurn={isMyTurn}
          />
        </div>
        )}

        {/* Board - takes maximum space */}
        <div className="order-1 portrait:order-1 landscape:order-2 flex-1 min-h-0 overflow-hidden flex items-center justify-center portrait:p-1 landscape:p-2">
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
            onFlip={flipTile}
            onCancelPlacement={() => selectTile(null)}
            scoringAnimation={scoringAnimation}
            colourBlindMode={colourBlindMode}
          />
        </div>

        {/* Scoreboard - compact strip at bottom in portrait, right panel in landscape */}
        <div className="order-2 portrait:order-2 landscape:order-3 portrait:shrink-0 landscape:w-48 landscape:lg:w-64 flex flex-col gap-2 portrait:p-1.5 landscape:p-2 overflow-y-auto portrait:border-t landscape:border-t-0 landscape:border-l border-[#312e6b]">
          <ScorePanel
            scores={gameState?.scores ?? {}}
            playerOrder={gameState?.playerOrder ?? []}
            myPlayerId={myPlayerId ?? ''}
            playerNames={playerNames}
            currentPlayerId={gameState?.currentPlayerId ?? ''}
            flashColors={scoringAnimation?.flashColors}
            forfeitedPlayerIds={gameState?.forfeitedPlayerIds ?? []}
          />
        </div>
      </div>

      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}

      {/* Forfeit confirmation dialog — players only */}
      {showForfeitConfirm && !isSpectating && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1833] rounded-2xl p-6 w-full max-w-sm border border-red-900 shadow-2xl">
            <h2 className="text-xl font-bold text-red-400 mb-2">Leave &amp; Forfeit?</h2>
            <p className="text-gray-300 text-sm mb-5">
              {(gameState?.playerOrder.filter(p => !(gameState.forfeitedPlayerIds ?? []).includes(p)).length ?? 0) > 2
                ? 'Your turns will be skipped for the rest of this game. The other players will keep playing.'
                : 'The remaining player will win the game by forfeit.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForfeitConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleForfeit}
                className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors text-sm"
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fade-in/out notification: INGENIOUS! or Your Turn */}
      {(lastIngenious || showTurnNotification) && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-40">
          {lastIngenious ? (
            <div
              key={`ing-${lastIngenious.color}-${lastIngenious.playerId}`}
              style={{
                animation: `fadeInOut ${INGENIOUS_ANIMATION_DURATION_MS / 1000}s ease-in-out forwards`,
                color: INGENIOUS_COLOR_HEX[lastIngenious.color],
                textShadow: `0 0 24px ${INGENIOUS_COLOR_HEX[lastIngenious.color]}, 0 0 48px ${INGENIOUS_COLOR_HEX[lastIngenious.color]}`,
              }}
              className="text-6xl portrait:text-5xl font-black tracking-widest uppercase select-none drop-shadow-2xl"
            >
              INGENIOUS!
            </div>
          ) : (
            <div
              key={`turn-${turnNotificationKey}`}
              style={{
                animation: `fadeInOut ${TURN_ANIMATION_DURATION_MS / 1000}s ease-in-out forwards`,
                textShadow: '0 0 24px rgba(168,85,247,0.9), 0 0 48px rgba(168,85,247,0.5)',
              }}
              className="text-5xl portrait:text-4xl font-black tracking-wider text-white select-none drop-shadow-2xl"
            >
              Your Turn!
            </div>
          )}
        </div>
      )}

      {gameOver && (
        <GameOverModal
          results={gameOver}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
          onClose={onNavigateHome}
        />
      )}
    </div>
  )
}
