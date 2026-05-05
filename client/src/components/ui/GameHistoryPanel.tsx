import { useState, useEffect } from 'react'
import type { PlayerHistoryEntry } from '@ingenious/shared'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const WIN_REASON_LABEL: Record<string, string> = {
  all_eighteen: '🏆 All 18s',
  no_moves: '🪨 No moves',
  forfeit: '🏳 Forfeit',
}

export default function GameHistoryPanel({ playerId }: { playerId: string | null }) {
  const [history, setHistory] = useState<PlayerHistoryEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded || !playerId || loaded) return
    setLoading(true)
    fetch('/api/player/history', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { history: PlayerHistoryEntry[] }) => {
        setHistory(d.history)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false))
  }, [expanded, playerId, loaded])

  if (!playerId) return null

  return (
    <div className="w-full max-w-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        <span>📜 Previous Games</span>
        <span className="text-gray-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="bg-[#1a1833] rounded-xl border border-[#312e6b] overflow-hidden">
          {loading && (
            <p className="text-xs text-gray-500 text-center py-4">Loading…</p>
          )}
          {!loading && loaded && history.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">No completed games yet.</p>
          )}
          {!loading && history.map((entry, i) => {
            const opponents = entry.opponentNames.length > 0
              ? entry.opponentNames.join(', ')
              : entry.aiDifficulty
                ? `Computer (${entry.aiDifficulty})`
                : '—'
            return (
              <div
                key={entry.id}
                className={`flex items-start gap-2 px-3 py-2 text-xs ${
                  i < history.length - 1 ? 'border-b border-[#312e6b]' : ''
                }`}
              >
                {/* Win / loss badge */}
                <span
                  className={`mt-0.5 shrink-0 font-bold text-[10px] px-1.5 py-0.5 rounded-full ${
                    entry.won
                      ? 'bg-green-900/60 text-green-300'
                      : 'bg-red-900/40 text-red-400'
                  }`}
                >
                  {entry.won ? 'W' : 'L'}
                </span>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">
                    vs <span className="font-medium">{opponents}</span>
                    {!entry.won && entry.winnerName && (
                      <span className="text-gray-500"> · won by {entry.winnerName}</span>
                    )}
                  </div>
                  <div className="text-gray-500 flex flex-wrap gap-x-2 mt-0.5">
                    {entry.winReason && (
                      <span>{WIN_REASON_LABEL[entry.winReason] ?? entry.winReason}</span>
                    )}
                    <span>{entry.moveCount} moves</span>
                    {entry.durationSeconds > 0 && (
                      <span>{formatDuration(entry.durationSeconds)}</span>
                    )}
                    {entry.turnMode === 'async' && <span>☁ Turn-based</span>}
                  </div>
                </div>

                {/* Date */}
                <span className="shrink-0 text-gray-600 text-[10px] mt-0.5">
                  {formatDate(entry.finishedAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
