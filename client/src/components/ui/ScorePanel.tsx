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
  flashColors?: Set<Color>
}

export default function ScorePanel({
  scores,
  playerOrder,
  myPlayerId,
  playerNames,
  currentPlayerId,
  flashColors,
}: ScorePanelProps) {
  return (
    <>
      {/* Compact portrait layout: horizontal rows per player */}
      <div className="portrait:block landscape:hidden">
        <div className="flex flex-row flex-wrap gap-2 py-1">
          {playerOrder.map(pid => {
            const playerScores = scores[pid] ?? {}
            const isMe = pid === myPlayerId
            const isCurrent = pid === currentPlayerId
            const name = playerNames[pid] ?? pid

            return (
              <div
                key={pid}
                className={`min-w-[25%] max-w-[50%] flex-1 flex flex-col gap-1 px-2 py-1 rounded-lg border ${
                  isCurrent ? 'border-green-500/60 bg-[#1a1833]' : 'border-[#312e6b] bg-[#1a1833]'
                } ${isCurrent ? 'opacity-100' : 'opacity-70'}`}
              >
                <div className="flex items-center gap-1">
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                  <span className={`text-[10px] font-medium truncate max-w-[64px] ${isMe ? 'text-purple-300' : 'text-gray-300'}`}>
                    {name}{isMe ? ' ★' : ''}
                  </span>
                </div>
                <div className="flex gap-1">
                  {COLORS.map(color => {
                    const score = playerScores[color] ?? 0
                    const { bg, text } = COLOR_STYLES[color]
                    const isFlashing = flashColors?.has(color) ?? false
                    return (
                      <div
                        key={color}
                        className="flex flex-col items-center"
                        style={{ minWidth: 18 }}
                      >
                        <div
                          className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold"
                          style={{
                            backgroundColor: bg,
                            color: text,
                            animation: isFlashing ? 'score-flash 600ms ease-out 1200ms both' : undefined,
                          }}
                        >
                          {score}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Full landscape layout: vertical bar charts */}
      <div className="portrait:hidden landscape:block bg-[#1a1833] rounded-xl p-3 border border-[#312e6b]">
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
                    const isFlashing = flashColors?.has(color) ?? false

                    return (
                      <div key={color} className="flex flex-col items-center gap-0.5">
                        <div className="w-full h-12 bg-[#0f0e17] rounded-sm relative overflow-hidden">
                          <div
                            className="absolute bottom-0 w-full rounded-sm transition-all duration-500"
                            style={{
                              height: `${pct}%`,
                              backgroundColor: bg,
                              animation: isFlashing ? 'score-flash 600ms ease-out 1200ms both' : undefined,
                              color: bg,
                            }}
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
    </>
  )
}
