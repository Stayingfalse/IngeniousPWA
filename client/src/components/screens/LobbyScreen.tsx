import { useLobbyStore } from '../../store/lobbyStore'
import { wsClient } from '../../lib/wsClient'

type Screen = 'home' | 'lobby' | 'game'

interface LobbyScreenProps {
  onNavigate: (screen: Screen) => void
}

export default function LobbyScreen({ onNavigate }: LobbyScreenProps) {
  const { lobbyState, lobbyId, myPlayerId } = useLobbyStore()

  const isHost = lobbyState?.hostId === myPlayerId
  const canStart = isHost && (lobbyState?.players.length ?? 0) >= 2

  const handleStart = () => {
    wsClient.send({ type: 'START_GAME' })
  }

  const handleLeave = () => {
    onNavigate('home')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-purple-300 mb-1">Lobby</h1>
        <div className="text-gray-400 text-sm">
          Code: <span className="font-mono text-white text-lg tracking-widest">{lobbyId}</span>
        </div>
        <p className="text-gray-500 text-xs mt-1">Share this code with friends</p>
      </div>

      <div className="bg-[#1a1833] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[#312e6b]">
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
          Players ({lobbyState?.players.length ?? 0}/{lobbyState?.maxPlayers ?? '?'})
        </h2>

        <div className="space-y-2 mb-6">
          {lobbyState?.players.map(player => (
            <div
              key={player.id}
              className="flex items-center gap-3 bg-[#0f0e17] rounded-lg px-4 py-3"
            >
              <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-sm font-bold">
                {player.seat + 1}
              </div>
              <span className="flex-1 text-white">{player.name}</span>
              {player.id === lobbyState?.hostId && (
                <span className="text-xs text-yellow-400">Host</span>
              )}
              {player.id === myPlayerId && (
                <span className="text-xs text-purple-400">You</span>
              )}
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: (lobbyState?.maxPlayers ?? 2) - (lobbyState?.players.length ?? 0) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 bg-[#0f0e17] rounded-lg px-4 py-3 opacity-40"
            >
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-sm">
                ?
              </div>
              <span className="text-gray-500 italic">Waiting…</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {isHost && (
            <button
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                canStart
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
              onClick={handleStart}
              disabled={!canStart}
            >
              {canStart ? 'Start Game' : `Need ${2 - (lobbyState?.players.length ?? 0)} more player(s)`}
            </button>
          )}
          {!isHost && (
            <p className="text-center text-gray-500 text-sm py-3">
              Waiting for host to start the game…
            </p>
          )}
          <button
            className="w-full py-2 rounded-lg text-gray-400 hover:text-white transition-colors text-sm"
            onClick={handleLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
