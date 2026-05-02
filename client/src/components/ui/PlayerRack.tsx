import type { Tile } from '@ingenious/shared'

const COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

interface PlayerRackProps {
  tiles: Tile[]
  selectedIndex: number | null
  tileFlipped: boolean
  onSelect: (index: number | null) => void
  onFlip: () => void
  isMyTurn: boolean
  onSwap: () => void
}

export default function PlayerRack({ tiles, selectedIndex, tileFlipped, onSelect, onFlip, isMyTurn, onSwap }: PlayerRackProps) {
  return (
    <div className="flex items-center gap-3 justify-center flex-wrap">
      <div className="flex gap-2 items-end">
        {tiles.map((tile, i) => {
          const isSelected = selectedIndex === i
          const displayA = isSelected && tileFlipped ? tile.colorB : tile.colorA
          const displayB = isSelected && tileFlipped ? tile.colorA : tile.colorB
          return (
            <button
              key={i}
              onClick={() => onSelect(selectedIndex === i ? null : i)}
              disabled={!isMyTurn}
              className={`flex flex-col rounded-lg overflow-hidden border-2 transition-transform ${
                isSelected
                  ? 'border-white scale-110 shadow-lg'
                  : 'border-transparent hover:border-purple-400'
              } ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ width: 36 }}
            >
              <div
                style={{ backgroundColor: COLOR_MAP[displayA], height: 20 }}
              />
              <div
                style={{ backgroundColor: COLOR_MAP[displayB], height: 20 }}
              />
            </button>
          )
        })}
      </div>

      {isMyTurn && selectedIndex !== null && (
        <button
          onClick={onFlip}
          className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded transition-colors"
          title="Flip tile orientation"
        >
          ↻ Flip
        </button>
      )}

      {isMyTurn && (
        <button
          onClick={onSwap}
          className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded transition-colors ml-2"
          title="Swap rack (only if no tiles match lowest-scoring color)"
        >
          Swap
        </button>
      )}
    </div>
  )
}
