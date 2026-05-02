import { useState } from 'react'
import { useLobbyStore } from '../../store/lobbyStore'
import { wsClient } from '../../lib/wsClient'

type Screen = 'home' | 'lobby' | 'game'

interface LobbyScreenProps {
  onNavigate: (screen: Screen) => void
}

export default function LobbyScreen({ onNavigate }: LobbyScreenProps) {
  const { lobbyState, lobbyId, myPlayerId, myPlayerName } = useLobbyStore()
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')

  const isHost = lobbyState?.hostId === myPlayerId
  const canStart = isHost && (lobbyState?.players.length ?? 0) >= 2

  const handleStart = () => {
    wsClient.send({ type: 'START_GAME' })
  }

  const handleLeave = () => {
    onNavigate('home')
  }

  const handleCopyCode = async () => {
    if (!lobbyId) return
    try {
      await navigator.clipboard.writeText(lobbyId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text if clipboard API not available
    }
  }

  const handleCopyInviteLink = async () => {
    if (!lobbyId) return
    try {
      const url = `${location.origin}/?join=${lobbyId}`
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Fallback silently
    }
  }

  const handleStartEditName = () => {
    setNameInput(myPlayerName || '')
    setNameError('')
    setEditingName(true)
  }

  const handleSaveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed.length < 1 || trimmed.length > 20) {
      setNameError('Name must be 1–20 characters')
      return
    }
    try {
      const res = await fetch('/api/player/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setNameError(data.error || 'Failed to update name')
        return
      }
      // Broadcast name change to all lobby members via WebSocket
      wsClient.send({ type: 'CHANGE_NAME', name: trimmed })
      setEditingName(false)
    } catch {
      setNameError('Network error')
    }
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSaveName()
    if (e.key === 'Escape') setEditingName(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-purple-300 mb-1">Lobby</h1>
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          Code: <span className="font-mono text-white text-lg tracking-widest">{lobbyId}</span>
          <button
            onClick={handleCopyCode}
            title="Copy lobby code"
            className="ml-1 text-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <span className="text-green-400 text-xs font-medium">Copied!</span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-1">
          <button
            onClick={handleCopyInviteLink}
            title="Copy invite link"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {copiedLink ? <span className="text-green-400">Link copied!</span> : 'Copy invite link'}
          </button>
        </div>
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
              {player.id === myPlayerId && editingName ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    className="flex-1 bg-[#1a1833] border border-purple-500 rounded px-2 py-0.5 text-white text-sm focus:outline-none"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    maxLength={20}
                    autoFocus
                  />
                  <button onClick={() => void handleSaveName()} className="text-green-400 hover:text-green-300 text-xs px-1">Save</button>
                  <button onClick={() => setEditingName(false)} className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
                </div>
              ) : (
                <span className="flex-1 text-white flex items-center gap-1">
                  {player.name}
                  {player.id === myPlayerId && (
                    <button
                      onClick={handleStartEditName}
                      title="Change name"
                      className="ml-1 text-gray-500 hover:text-purple-400 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.415.586H9v-2.414a2 2 0 01.586-1.414z" />
                      </svg>
                    </button>
                  )}
                </span>
              )}
              {player.id === lobbyState?.hostId && (
                <span className="text-xs text-yellow-400">Host</span>
              )}
              {player.id === myPlayerId && !editingName && (
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

        {nameError && <p className="text-red-400 text-xs mb-3">{nameError}</p>}

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
