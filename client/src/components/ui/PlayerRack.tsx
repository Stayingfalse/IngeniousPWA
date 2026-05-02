import type { Tile } from '@ingenious/shared'

const COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

// Generate hexagon SVG path for flat-top hexagon
function getHexagonPath(size: number): string {
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    const x = size / 2 + (size / 2) * Math.cos(angle)
    const y = size / 2 + (size / 2) * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return `M ${points.join(' L ')} Z`
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
  const hexSize = 24
  const hexHeight = hexSize * Math.sqrt(3) / 2
  const tileWidth = hexSize + 2
  const tileHeight = hexHeight * 2 + 2

  return (
    <div className="flex portrait:flex-row landscape:flex-col items-center gap-3 justify-center portrait:flex-wrap landscape:flex-nowrap w-full">
      <div className="flex portrait:flex-row landscape:flex-col gap-2 items-center portrait:items-end landscape:items-center">
        {tiles.map((tile, i) => {
          const isSelected = selectedIndex === i
          const displayA = isSelected && tileFlipped ? tile.colorB : tile.colorA
          const displayB = isSelected && tileFlipped ? tile.colorA : tile.colorB

          return (
            <button
              key={i}
              onClick={() => onSelect(selectedIndex === i ? null : i)}
              disabled={!isMyTurn}
              className={`relative transition-transform ${
                isSelected
                  ? 'scale-110'
                  : ''
              } ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ width: tileWidth, height: tileHeight }}
              title={`Tile: ${displayA} - ${displayB}`}
            >
              <svg
                width={tileWidth}
                height={tileHeight}
                viewBox={`-1 ${hexSize / 2 - 1} ${hexSize + 2} ${hexHeight * 2 + 2}`}
                className="block"
              >
                {/* Top hexagon */}
                <g transform={`translate(0, ${hexHeight / 2})`}>
                  <path
                    d={getHexagonPath(hexSize)}
                    fill={COLOR_MAP[displayA]}
                    stroke={isSelected ? '#ffffff' : '#312e6b'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </g>
                {/* Bottom hexagon */}
                <g transform={`translate(0, ${hexHeight * 1.5})`}>
                  <path
                    d={getHexagonPath(hexSize)}
                    fill={COLOR_MAP[displayB]}
                    stroke={isSelected ? '#ffffff' : '#312e6b'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </g>
              </svg>
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
          className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded transition-colors portrait:ml-2 landscape:ml-0"
          title="Swap rack (only if no tiles match lowest-scoring color)"
        >
          Swap
        </button>
      )}
    </div>
  )
}
