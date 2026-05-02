import { useState, useEffect } from 'react'
import { wsClient } from '../../lib/wsClient'
import { useLobbyStore } from '../../store/lobbyStore'
import IngeniousBanner from '../ui/IngeniousBanner'

export default function HomeScreen() {
  const [playerName, setPlayerName] = useState('')
  const [lobbyCode, setLobbyCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [error, setError] = useState('')
  const { myPlayerName } = useLobbyStore()

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

  const handleJoin = () => {
    const name = playerName.trim() || myPlayerName || 'Player'
    if (!lobbyCode.trim()) {
      setError('Enter a lobby code')
      return
    }
    setError('')
    wsClient.send({
      type: 'JOIN_LOBBY',
      lobbyId: lobbyCode.toUpperCase().trim(),
      playerName: name,
    })
  }

  const handleCreate = async () => {
    const name = playerName.trim() || myPlayerName || 'Player'
    setError('')

    try {
      const res = await fetch('/api/lobbies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPlayers }),
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
      <IngeniousBanner />

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
          <div>
            <label className="block text-sm mb-1 text-gray-300">Players</label>
            <select
              className="w-full bg-[#0f0e17] border border-[#312e6b] rounded-lg px-3 py-2 text-white mb-3"
              value={maxPlayers}
              onChange={e => setMaxPlayers(Number(e.target.value))}
            >
              <option value={2}>2 Players</option>
              <option value={3}>3 Players</option>
              <option value={4}>4 Players</option>
            </select>
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
    </div>
  )
}
