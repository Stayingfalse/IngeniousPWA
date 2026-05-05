import { useState, useEffect } from 'react'
import type { PlayerStats, GlobalStats } from '@ingenious/shared'

interface StatBarProps {
  label: string
  value: number
  max: number
  color: string
}

function StatBar({ label, value, max, color }: StatBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
        <span>{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-[#0f0e17] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function winPct(wins: number, total: number): string {
  if (total === 0) return '–'
  return `${Math.round((wins / total) * 100)}%`
}

export default function StatsPanel({ playerId }: { playerId: string | null }) {
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!playerId) return

    const fetchStats = async () => {
      setLoading(true)
      try {
        const [pRes, gRes] = await Promise.all([
          fetch('/api/player/stats', { credentials: 'include' }),
          fetch('/api/stats'),
        ])
        if (pRes.ok) {
          const pData = await pRes.json() as { stats: PlayerStats }
          setPlayerStats(pData.stats)
        }
        if (gRes.ok) {
          const gData = await gRes.json() as { stats: GlobalStats }
          setGlobalStats(gData.stats)
        }
      } catch {
        // Non-critical — stats panel stays hidden
      } finally {
        setLoading(false)
      }
    }

    void fetchStats()
  }, [playerId])

  if (loading || (!playerStats && !globalStats)) return null

  const hasPlayed = (playerStats?.gamesPlayed ?? 0) > 0

  return (
    <div className="w-full max-w-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
      >
        <span>📊 {hasPlayed ? 'Your Stats' : 'Global Stats'}</span>
        <span className="text-gray-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Always-visible summary row */}
      {hasPlayed && playerStats ? (
        <div className="bg-[#1a1833] rounded-xl border border-[#312e6b] px-4 py-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-white">{playerStats.gamesPlayed}</div>
              <div className="text-xs text-gray-400">Played</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-400">{playerStats.gamesWon}</div>
              <div className="text-xs text-gray-400">Won</div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-400">{playerStats.uniqueOpponents}</div>
              <div className="text-xs text-gray-400">Opponents</div>
            </div>
          </div>

          {/* Streak row */}
          {playerStats.bestWinStreak > 0 && (
            <div className="flex justify-center gap-4 mt-2 text-xs">
              {playerStats.currentWinStreak > 0 ? (
                <span className="text-orange-400">🔥 {playerStats.currentWinStreak} win streak</span>
              ) : (
                <span className="text-gray-500">No active streak</span>
              )}
              <span className="text-gray-500">best: {playerStats.bestWinStreak}</span>
            </div>
          )}

          {expanded && (
            <div className="mt-4 space-y-2 border-t border-[#312e6b] pt-3">
              <StatBar
                label="Win rate"
                value={playerStats.gamesWon}
                max={playerStats.gamesPlayed}
                color="bg-green-500"
              />
              {playerStats.mostCommonOpponentName && (
                <p className="text-xs text-gray-400 pt-1">
                  🏆 Most vs <span className="text-white font-semibold">{playerStats.mostCommonOpponentName}</span>
                  <span className="text-gray-500"> ({playerStats.mostCommonOpponentGames} games)</span>
                </p>
              )}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">Opponents</p>
              <StatBar
                label="🤖 vs Computer"
                value={playerStats.vsComputerGames}
                max={playerStats.gamesPlayed}
                color="bg-cyan-500"
              />
              <StatBar
                label="👤 vs Humans"
                value={playerStats.gamesPlayed - playerStats.vsComputerGames}
                max={playerStats.gamesPlayed}
                color="bg-purple-500"
              />
              {globalStats && globalStats.totalGames > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">Global</p>
                  <StatBar label="🤖 vs Computer" value={globalStats.vsComputerGames} max={globalStats.totalGames} color="bg-cyan-500" />
                  <StatBar label="👤 vs Humans" value={globalStats.totalGames - globalStats.vsComputerGames} max={globalStats.totalGames} color="bg-purple-500" />
                  <StatBar label="⚡ Real-time" value={globalStats.realtimeGames} max={globalStats.totalGames} color="bg-blue-500" />
                  <StatBar label="☁ Turn-based" value={globalStats.asyncGames} max={globalStats.totalGames} color="bg-indigo-400" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">How games end</p>
                  <StatBar label="🏆 All 18s" value={globalStats.wonByAllEighteen} max={globalStats.totalGames} color="bg-yellow-500" />
                  <StatBar label="🪨 No moves left" value={globalStats.wonByNoMoves} max={globalStats.totalGames} color="bg-orange-500" />
                  <StatBar label="🏳 Forfeit" value={globalStats.wonByForfeit} max={globalStats.totalGames} color="bg-red-500" />
                  {(globalStats.aiTotalEasy + globalStats.aiTotalMedium + globalStats.aiTotalHard) > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">Win % vs AI difficulty</p>
                      {globalStats.aiTotalEasy > 0 && (
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>😊 Easy</span>
                          <span className="font-mono text-white">{winPct(globalStats.aiWinsEasy, globalStats.aiTotalEasy)} <span className="text-gray-500">({globalStats.aiTotalEasy}g)</span></span>
                        </div>
                      )}
                      {globalStats.aiTotalMedium > 0 && (
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>🤔 Medium</span>
                          <span className="font-mono text-white">{winPct(globalStats.aiWinsMedium, globalStats.aiTotalMedium)} <span className="text-gray-500">({globalStats.aiTotalMedium}g)</span></span>
                        </div>
                      )}
                      {globalStats.aiTotalHard > 0 && (
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>😤 Hard</span>
                          <span className="font-mono text-white">{winPct(globalStats.aiWinsHard, globalStats.aiTotalHard)} <span className="text-gray-500">({globalStats.aiTotalHard}g)</span></span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : globalStats && globalStats.totalGames > 0 ? (
        <div className="bg-[#1a1833] rounded-xl border border-[#312e6b] px-4 py-3">
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div>
              <div className="text-xl font-bold text-white">{globalStats.totalGames}</div>
              <div className="text-xs text-gray-400">Games</div>
            </div>
            <div>
              <div className="text-xl font-bold text-cyan-400">{globalStats.vsComputerGames}</div>
              <div className="text-xs text-gray-400">🤖 vs Computer</div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-400">{globalStats.totalGames - globalStats.vsComputerGames}</div>
              <div className="text-xs text-gray-400">👤 vs Humans</div>
            </div>
          </div>

          {expanded && (
            <div className="space-y-2 border-t border-[#312e6b] pt-3">
              <StatBar label="⚡ Real-time" value={globalStats.realtimeGames} max={globalStats.totalGames} color="bg-blue-500" />
              <StatBar label="☁ Turn-based" value={globalStats.asyncGames} max={globalStats.totalGames} color="bg-indigo-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">How games end</p>
              <StatBar label="🏆 All 18s" value={globalStats.wonByAllEighteen} max={globalStats.totalGames} color="bg-yellow-500" />
              <StatBar label="🪨 No moves left" value={globalStats.wonByNoMoves} max={globalStats.totalGames} color="bg-orange-500" />
              <StatBar label="🏳 Forfeit" value={globalStats.wonByForfeit} max={globalStats.totalGames} color="bg-red-500" />
              {(globalStats.aiTotalEasy + globalStats.aiTotalMedium + globalStats.aiTotalHard) > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">Win % vs AI difficulty</p>
                  {globalStats.aiTotalEasy > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>😊 Easy</span>
                      <span className="font-mono text-white">{winPct(globalStats.aiWinsEasy, globalStats.aiTotalEasy)} <span className="text-gray-500">({globalStats.aiTotalEasy}g)</span></span>
                    </div>
                  )}
                  {globalStats.aiTotalMedium > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>🤔 Medium</span>
                      <span className="font-mono text-white">{winPct(globalStats.aiWinsMedium, globalStats.aiTotalMedium)} <span className="text-gray-500">({globalStats.aiTotalMedium}g)</span></span>
                    </div>
                  )}
                  {globalStats.aiTotalHard > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>😤 Hard</span>
                      <span className="font-mono text-white">{winPct(globalStats.aiWinsHard, globalStats.aiTotalHard)} <span className="text-gray-500">({globalStats.aiTotalHard}g)</span></span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
