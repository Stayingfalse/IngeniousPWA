import { useTournamentStore } from '../../store/tournamentStore'
import { useLobbyStore } from '../../store/lobbyStore'
import { wsClient } from '../../lib/wsClient'

export default function TournamentLobbyScreen() {
  const { tournamentState } = useTournamentStore()
  const { myPlayerId } = useLobbyStore()

  if (!tournamentState) return null

  const isHost = tournamentState.hostId === myPlayerId
  const canStart = isHost && tournamentState.players.length >= 2 && tournamentState.status === 'registering'

  const handleStart = () => {
    wsClient.send({ type: 'START_TOURNAMENT' })
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Tournament Lobby</h2>
      <p>
        Code: <strong>{tournamentState.id}</strong>
        &nbsp;|&nbsp;
        Format: <strong>{tournamentState.format === 'round_robin' ? 'Round Robin' : 'Swiss'}</strong>
        &nbsp;|&nbsp;
        Players: <strong>{tournamentState.players.length}/{tournamentState.maxPlayers}</strong>
      </p>

      <h3>Players Registered</h3>
      <ul>
        {tournamentState.players.map(p => (
          <li key={p.id}>
            {p.name}
            {p.id === tournamentState.hostId ? ' (Host)' : ''}
            {p.id === myPlayerId ? ' (You)' : ''}
          </li>
        ))}
      </ul>

      {isHost && (
        <div style={{ marginTop: '16px' }}>
          {canStart ? (
            <button onClick={handleStart} style={{ padding: '10px 24px', fontSize: '16px' }}>
              Start Tournament
            </button>
          ) : (
            <p style={{ color: '#888' }}>Waiting for players... ({tournamentState.players.length}/{tournamentState.maxPlayers})</p>
          )}
        </div>
      )}

      {!isHost && (
        <p style={{ color: '#888', marginTop: '16px' }}>Waiting for host to start...</p>
      )}
    </div>
  )
}
