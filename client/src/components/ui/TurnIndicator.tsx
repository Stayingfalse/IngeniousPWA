interface TurnIndicatorProps {
  currentPlayerId: string
  myPlayerId: string
  playerNames: Record<string, string>
}

export default function TurnIndicator({ currentPlayerId, myPlayerId, playerNames }: TurnIndicatorProps) {
  const isMyTurn = currentPlayerId === myPlayerId
  const name = playerNames[currentPlayerId] ?? currentPlayerId

  return (
    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
      isMyTurn ? 'bg-green-700 text-white' : 'bg-[#312e6b] text-gray-300'
    }`}>
      {isMyTurn ? 'Your turn' : `${name}'s turn`}
    </div>
  )
}
