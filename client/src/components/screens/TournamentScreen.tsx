import { useTournamentStore } from '../../store/tournamentStore'
import { useLobbyStore } from '../../store/lobbyStore'
import { wsClient } from '../../lib/wsClient'

interface TournamentScreenProps {
  onEnterMatch?: (lobbyId: string) => void
}

export default function TournamentScreen({ onEnterMatch }: TournamentScreenProps) {
  const { tournamentState, myMatchId, myLobbyId, finalStandings } = useTournamentStore()
  const { myPlayerId } = useLobbyStore()

  if (!tournamentState) return null

  const standings = finalStandings ?? tournamentState.standings
  const currentRound = tournamentState.currentRound
  const activeRound = tournamentState.rounds.find(r => r.roundNumber === currentRound)

  const handleForfeitTournament = () => {
    if (confirm('Are you sure you want to forfeit the tournament? You will be eliminated.')) {
      wsClient.send({ type: 'FORFEIT_TOURNAMENT' })
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      <h2>Tournament {tournamentState.id}</h2>
      <p>
        Format: <strong>{tournamentState.format === 'round_robin' ? 'Round Robin' : 'Swiss'}</strong>
        &nbsp;|&nbsp;
        Round: <strong>{currentRound}/{tournamentState.totalRounds}</strong>
        &nbsp;|&nbsp;
        Status: <strong>{tournamentState.status}</strong>
      </p>

      {tournamentState.status === 'finished' ? (
        <div>
          <h3>🏆 Tournament Complete!</h3>
        </div>
      ) : myLobbyId ? (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#e8f5e9', borderRadius: '8px' }}>
          <p><strong>Round {currentRound} - Your match is ready!</strong></p>
          <button
            onClick={() => onEnterMatch?.(myLobbyId)}
            style={{ padding: '8px 20px', fontSize: '14px' }}
          >
            Enter Match
          </button>
        </div>
      ) : (
        <p style={{ color: '#888' }}>Waiting for your next match...</p>
      )}

      {activeRound && (
        <div style={{ marginBottom: '24px' }}>
          <h3>Round {currentRound} Matches</h3>
          {activeRound.matches.map(match => (
            <div key={match.matchId} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '8px' }}>
              <span>
                {match.playerIds.map(pid => {
                  const p = tournamentState.players.find(pl => pl.id === pid)
                  return p?.name ?? pid
                }).join(' vs ')}
              </span>
              <span style={{ marginLeft: '8px', color: '#888', fontSize: '12px' }}>
                {match.status}
              </span>
              {match.matchId === myMatchId && <span style={{ marginLeft: '8px', color: '#2196F3', fontSize: '12px' }}>(Your match)</span>}
            </div>
          ))}
        </div>
      )}

      <div>
        <h3>Standings</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Rank</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Player</th>
              <th style={{ textAlign: 'center', padding: '8px' }}>W</th>
              <th style={{ textAlign: 'center', padding: '8px' }}>L</th>
              <th style={{ textAlign: 'center', padding: '8px' }}>Min Score</th>
              <th style={{ textAlign: 'center', padding: '8px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr
                key={s.playerId}
                style={{
                  borderBottom: '1px solid #eee',
                  background: s.playerId === myPlayerId ? '#e3f2fd' : undefined,
                  opacity: s.eliminated ? 0.5 : 1,
                }}
              >
                <td style={{ padding: '8px' }}>{i + 1}</td>
                <td style={{ padding: '8px' }}>
                  {s.playerName}
                  {s.eliminated && ' 🚫'}
                  {i === 0 && tournamentState.status === 'finished' && ' 🏆'}
                </td>
                <td style={{ textAlign: 'center', padding: '8px' }}>{s.wins}</td>
                <td style={{ textAlign: 'center', padding: '8px' }}>{s.losses}</td>
                <td style={{ textAlign: 'center', padding: '8px' }}>{s.cumulativeMinScore}</td>
                <td style={{ textAlign: 'center', padding: '8px' }}>{s.cumulativeTotalScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tournamentState.status === 'in_progress' && (
        <div style={{ marginTop: '24px' }}>
          <button
            onClick={handleForfeitTournament}
            style={{ padding: '8px 16px', color: '#f44336', border: '1px solid #f44336', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}
          >
            Forfeit Tournament
          </button>
        </div>
      )}
    </div>
  )
}
