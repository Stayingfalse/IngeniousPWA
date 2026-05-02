import type { Color } from '@ingenious/shared'

const COLORS: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

const COLOR_STYLES: Record<Color, { bg: string; text: string }> = {
  red: { bg: '#ef4444', text: '#fff' },
  orange: { bg: '#f97316', text: '#fff' },
  yellow: { bg: '#eab308', text: '#000' },
  green: { bg: '#22c55e', text: '#fff' },
  blue: { bg: '#3b82f6', text: '#fff' },
  purple: { bg: '#a855f7', text: '#fff' },
}

interface ScorePanelProps {
  scores: Record<string, Record<Color, number>>
  playerOrder: string[]
  myPlayerId: string
  playerNames: Record<string, string>
  currentPlayerId: string
}

export default function ScorePanel({
  scores,
  playerOrder,
  myPlayerId,
  playerNames,
  currentPlayerId,
}: ScorePanelProps) {
  return (
    <div className="bg-[#1a1833] rounded-xl p-3 border border-[#312e6b]">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Scores</h3>

      <div className="space-y-3">
        {playerOrder.map(pid => {
          const playerScores = scores[pid] ?? {}
          const isMe = pid === myPlayerId
          const isCurrent = pid === currentPlayerId
          const name = playerNames[pid] ?? pid

          return (
            <div key={pid} className={`${isCurrent ? 'opacity-100' : 'opacity-70'}`}>
              <div className="flex items-center gap-1 mb-1">
                {isCurrent && (
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                )}
                <span className={`text-xs font-medium ${isMe ? 'text-purple-300' : 'text-gray-300'}`}>
                  {name}{isMe ? ' (you)' : ''}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-0.5">
                {COLORS.map(color => {
                  const score = playerScores[color] ?? 0
                  const pct = Math.min(100, (score / 18) * 100)
                  const { bg } = COLOR_STYLES[color]

                  return (
                    <div key={color} className="flex flex-col items-center gap-0.5">
                      <div className="w-full h-12 bg-[#0f0e17] rounded-sm relative overflow-hidden">
                        <div
                          className="absolute bottom-0 w-full rounded-sm transition-all duration-500"
                          style={{ height: `${pct}%`, backgroundColor: bg }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400">{score}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
