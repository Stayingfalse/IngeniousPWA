import { useGameStore } from '../../store/gameStore'
import { useLobbyStore } from '../../store/lobbyStore'
import HexBoard from '../board/HexBoard'
import PlayerRack from '../ui/PlayerRack'
import ScorePanel from '../ui/ScorePanel'
import TurnIndicator from '../ui/TurnIndicator'
import GameOverModal from '../ui/GameOverModal'
import IngeniousBanner from '../ui/IngeniousBanner'
import { wsClient } from '../../lib/wsClient'
import type { AxialCoord } from '@ingenious/shared'

export default function GameScreen() {
  const { gameState, myRack, selectedTileIndex, selectTile, gameOver } = useGameStore()
  const { myPlayerId, lobbyState } = useLobbyStore()

  const isMyTurn = gameState?.currentPlayerId === myPlayerId

  const handleHexClick = (coord: AxialCoord) => {
    if (!isMyTurn || selectedTileIndex === null) return
    // TileGhost/HexBoard handles pair selection
  }

  const handleTilePlaced = (tileIndex: number, hexA: AxialCoord, hexB: AxialCoord) => {
    wsClient.send({ type: 'PLACE_TILE', tileIndex, hexA, hexB })
    selectTile(null)
  }

  const handleSwapRack = () => {
    wsClient.send({ type: 'SWAP_RACK' })
  }

  const playerNames = Object.fromEntries(
    lobbyState?.players.map(p => [p.id, p.name]) ?? []
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1833] border-b border-[#312e6b]">
        <IngeniousBanner small />
        <TurnIndicator
          currentPlayerId={gameState?.currentPlayerId ?? ''}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
        />
        <div className="text-xs text-gray-400">
          {gameState?.tileBagCount ?? 0} tiles left
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-2">
          <HexBoard
            board={gameState?.board ?? {}}
            radius={gameState?.radius ?? 6}
            myRack={myRack}
            selectedTileIndex={selectedTileIndex}
            isMyTurn={isMyTurn}
            onTilePlaced={handleTilePlaced}
          />
        </div>

        {/* Right panel */}
        <div className="w-48 lg:w-64 flex flex-col gap-2 p-2 overflow-y-auto">
          <ScorePanel
            scores={gameState?.scores ?? {}}
            playerOrder={gameState?.playerOrder ?? []}
            myPlayerId={myPlayerId ?? ''}
            playerNames={playerNames}
            currentPlayerId={gameState?.currentPlayerId ?? ''}
          />
        </div>
      </div>

      {/* Bottom: player rack */}
      <div className="bg-[#1a1833] border-t border-[#312e6b] p-3">
        <PlayerRack
          tiles={myRack}
          selectedIndex={selectedTileIndex}
          onSelect={selectTile}
          isMyTurn={isMyTurn}
          onSwap={handleSwapRack}
        />
      </div>

      {gameOver && (
        <GameOverModal
          results={gameOver}
          myPlayerId={myPlayerId ?? ''}
          playerNames={playerNames}
          onClose={() => useGameStore.getState().reset()}
        />
      )}
    </div>
  )
}
