import { useState, useEffect, useRef } from 'react'
import { wsClient } from '../../lib/wsClient'
import { useLobbyStore } from '../../store/lobbyStore'
import IngeniousBanner from '../ui/IngeniousBanner'
import HowToPlayModal from '../ui/HowToPlayModal'
import StatsPanel from '../ui/StatsPanel'
import type { TurnMode, ActiveGameSummary } from '@ingenious/shared'

const TIMER_PRESETS: { label: string; seconds: number }[] = [
  { label: '30 s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
]

export default function HomeScreen({
  globalError,
  activeGames = [],
  onEnterGame,
  playerId,
}: {
  globalError?: string
  activeGames?: ActiveGameSummary[]
  onEnterGame?: (lobbyId: string) => void
  playerId?: string | null
}) {
  const { myPlayerName } = useLobbyStore()
  const [playerName, setPlayerName] = useState('')
  const [lobbyCode, setLobbyCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [turnMode, setTurnMode] = useState<TurnMode>('realtime')
  const [turnLimitSeconds, setTurnLimitSeconds] = useState<number>(60)
  const [error, setError] = useState('')
  const [showHowToPlay, setShowHowToPlay] = useState(false)

  // Display global error if provided
  useEffect(() => {
    if (globalError) {
      setError(globalError)
    }
  }, [globalError])

  // Load player name from localStorage/store only once on mount
  const nameInitialized = useRef(false)
  useEffect(() => {
    if (nameInitialized.current) return
    nameInitialized.current = true
    const savedName = localStorage.getItem('playerName')
    if (savedName && savedName.trim()) {
      setPlayerName(savedName)
    } else if (myPlayerName) {
      setPlayerName(myPlayerName)
    }
  }, [myPlayerName])

  // Auto-fill lobby code from ?join=XXXXXX URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const joinCode = params.get('join')
    if (joinCode) {
      setLobbyCode(joinCode.toUpperCase().slice(0, 6))
      setMode('join')
      // Clean the URL without reloading
      const url = new URL(window.location.href)
      url.searchParams.delete('join')
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  const handlePlayVsComputer = async () => {
    const name = playerName.trim() || myPlayerName || 'Player'
    setError('')
    localStorage.setItem('playerName', name)
    try {
      const res = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vsAI: true }),
        credentials: 'include',
      })
      const data = await res.json() as { lobbyId?: string; error?: string }
      if (!data.lobbyId) {
        setError(data.error || 'Failed to start game')
        return
      }
      wsClient.send({
        type: 'JOIN_LOBBY',
        lobbyId: data.lobbyId,
        playerName: name,
      })
    } catch {
      setError('Network error')
    }
  }

  const handleJoin = () => {
    const name = playerName.trim() || myPlayerName || 'Player'
    if (!lobbyCode.trim()) {
      setError('Enter a lobby code')
      return
    }
    setError('')
    // Save name to localStorage
    localStorage.setItem('playerName', name)
    wsClient.send({
      type: 'JOIN_LOBBY',
      lobbyId: lobbyCode.toUpperCase().trim(),
      playerName: name,
    })
  }

  const handleCreate = async () => {
    const name = playerName.trim() || myPlayerName || 'Player'
    setError('')
    // Save name to localStorage
    localStorage.setItem('playerName', name)

    try {
      const res = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPlayers,
          turnMode,
          turnLimitSeconds: turnMode === 'async' ? null : turnLimitSeconds,
        }),
        credentials: 'include',
      })
      const data = await res.json() as { lobbyId?: string; error?: string }
      if (!data.lobbyId) {
        setError(data.error || 'Failed to create lobby')
        return
      }

      wsClient.send({
        type: 'JOIN_LOBBY',
        lobbyId: data.lobbyId,
        playerName: name,
      })
    } catch {
      setError('Network error')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-6">
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

      <IngeniousBanner />

      <StatsPanel playerId={playerId ?? null} />

      {/* Active turn-based games — shown above the join/create form */}
      {activeGames.length > 0 && (
        <div className="w-full max-w-sm">
          <h2 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
            Your Turn-Based Games
          </h2>
          <div className="space-y-2">
            {activeGames.map(game => {
              const currentPlayerName = game.players.find(p => p.id === game.currentPlayerId)?.name ?? 'Opponent'
              return (
                <div
                  key={game.lobbyId}
                  className={`bg-[#1a1833] rounded-xl px-4 py-3 border flex items-center gap-3 ${
                    game.yourTurn ? 'border-green-500/50' : 'border-[#312e6b]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-500">{game.lobbyId}</span>
                      {game.yourTurn ? (
                        <span className="text-xs bg-green-900/60 text-green-300 px-1.5 py-0.5 rounded-full font-medium">
                          🟢 Your Turn
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          ⏳ {currentPlayerName}&apos;s turn
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white truncate">
                      {game.players.map(p => p.name).join(' vs ')}
                    </div>
                  </div>
                  <button
                    onClick={() => onEnterGame?.(game.lobbyId)}
                    className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Enter
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-[#1a1833] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[#312e6b]">
        <div className="mb-4">
          <label className="block text-sm mb-1 text-gray-300">Your Name</label>
          <input
            className="w-full bg-[#0f0e17] border border-[#312e6b] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'join' ? 'bg-purple-600 text-white' : 'bg-[#0f0e17] text-gray-400'}`}
            onClick={() => setMode('join')}
          >
            Join Game
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'create' ? 'bg-purple-600 text-white' : 'bg-[#0f0e17] text-gray-400'}`}
            onClick={() => setMode('create')}
          >
            Create Game
          </button>
        </div>

        {mode === 'join' ? (
          <div>
            <label className="block text-sm mb-1 text-gray-300">Lobby Code</label>
            <input
              className="w-full bg-[#0f0e17] border border-[#312e6b] rounded-lg px-3 py-2 text-white uppercase tracking-widest text-center font-mono text-lg focus:outline-none focus:border-purple-500 mb-3"
              value={lobbyCode}
              onChange={e => setLobbyCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
            />
            <button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
              onClick={handleJoin}
            >
              Join
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1 text-gray-300">Players</label>
              <select
                className="w-full bg-[#0f0e17] border border-[#312e6b] rounded-lg px-3 py-2 text-white"
                value={maxPlayers}
                onChange={e => setMaxPlayers(Number(e.target.value))}
              >
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-300">Game Mode</label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    turnMode === 'realtime'
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-[#0f0e17] border-[#312e6b] text-gray-400 hover:border-purple-500'
                  }`}
                  onClick={() => setTurnMode('realtime')}
                >
                  ⚡ Real-time
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    turnMode === 'async'
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-[#0f0e17] border-[#312e6b] text-gray-400 hover:border-purple-500'
                  }`}
                  onClick={() => setTurnMode('async')}
                >
                  ☁ Turn-based
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                {turnMode === 'realtime'
                  ? 'All players online at the same time; turns are time-limited.'
                  : 'Take turns when convenient — hours or days between moves.'}
              </p>
            </div>

            {turnMode === 'realtime' && (
              <div>
                <label className="block text-sm mb-1 text-gray-300">Turn Timer</label>
                <div className="grid grid-cols-4 gap-1">
                  {TIMER_PRESETS.map(p => (
                    <button
                      key={p.seconds}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        turnLimitSeconds === p.seconds
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-[#0f0e17] border-[#312e6b] text-gray-400 hover:border-purple-500'
                      }`}
                      onClick={() => setTurnLimitSeconds(p.seconds)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
              onClick={handleCreate}
            >
              Create & Join
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Play vs Computer — single-player option */}
      <div className="w-full max-w-sm">
        <button
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 border border-indigo-500/60"
          onClick={() => void handlePlayVsComputer()}
        >
          🤖 Play vs Computer
        </button>
      </div>

      {/* How to Play link */}
      <button
        onClick={() => setShowHowToPlay(true)}
        className="text-purple-400 hover:text-purple-300 text-sm underline underline-offset-2 transition-colors"
      >
        How to Play
      </button>

      {/* Legal disclaimer */}
      <p className="text-gray-600 text-xs text-center max-w-sm px-2">
        Ingenious is a board game originally designed by Reiner Knizia and published by Sophisticated Games Ltd. / Rio Grande Games. This fan-made web implementation is not affiliated with or endorsed by the original creators or rights holders.
      </p>
    <script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js" data-id="cezzt" data-description="Support me on Buy me a coffee!" data-message="Help keep this apps servers running and buy me a coffee. " data-color="#BD5FFF" data-position="Right" data-x_margin="18" data-y_margin="18"></script>
   </div>
      )
}
