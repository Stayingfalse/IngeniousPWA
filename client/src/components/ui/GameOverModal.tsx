import type { GameResults, Color } from '@ingenious/shared'

const COLORS: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

const COLOR_DOT: Record<Color, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

interface GameOverModalProps {
  results: GameResults
  myPlayerId: string
  playerNames: Record<string, string>
  onClose: () => void
}

export default function GameOverModal({ results, myPlayerId, playerNames, onClose }: GameOverModalProps) {
  const isWinner = results.winner === myPlayerId
  const winnerName = results.winner ? (playerNames[results.winner] ?? results.winner) : 'Nobody'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1833] rounded-2xl p-6 w-full max-w-sm border border-[#312e6b] shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-1">
          {isWinner ? '🎉 You Won!' : 'Game Over'}
        </h2>
        <p className="text-center text-gray-400 text-sm mb-4">
          {results.reason === 'all_eighteen'
            ? `${winnerName} reached 18 in all colors!`
            : `Winner: ${winnerName} (highest minimum score)`}
        </p>

        <div className="space-y-3 mb-6">
          {Object.entries(results.scores).map(([pid, scores]) => {
            const name = playerNames[pid] ?? pid
            const isMe = pid === myPlayerId

            return (
              <div key={pid} className="bg-[#0f0e17] rounded-lg p-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  {pid === results.winner && <span>👑</span>}
                  {name}{isMe ? ' (you)' : ''}
                </div>
                <div className="flex gap-1">
                  {COLORS.map(color => (
                    <div key={color} className="flex-1 text-center">
                      <div
                        className="w-4 h-4 rounded-full mx-auto mb-0.5"
                        style={{ backgroundColor: COLOR_DOT[color] }}
                      />
                      <span className="text-xs text-gray-300">{scores[color] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}
