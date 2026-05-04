import type { Tile, Color } from '@ingenious/shared'

const COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

// Unique shape/symbol per colour for colour-blind mode (mirrors HexCell/TileGhost)
const CBM_SYMBOL: Record<Color, (cx: number, cy: number, s: number) => JSX.Element> = {
  red: (cx, cy, s) => (
    <circle key="cbm" cx={cx} cy={cy} r={s * 0.32} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.12} />
  ),
  orange: (cx, cy, s) => {
    const h = s * 0.3
    return (
      <rect key="cbm" x={cx - h} y={cy - h} width={h * 2} height={h * 2} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.12} transform={`rotate(45 ${cx} ${cy})`} />
    )
  },
  yellow: (cx, cy, s) => {
    const h = s * 0.36
    const pts = `${cx},${cy - h} ${cx - h * 0.87},${cy + h * 0.5} ${cx + h * 0.87},${cy + h * 0.5}`
    return <polygon key="cbm" points={pts} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.12} />
  },
  green: (cx, cy, s) => {
    const arm = s * 0.3
    const thick = s * 0.1
    return (
      <g key="cbm">
        <rect x={cx - thick} y={cy - arm} width={thick * 2} height={arm * 2} fill="rgba(0,0,0,0.5)" />
        <rect x={cx - arm} y={cy - thick} width={arm * 2} height={thick * 2} fill="rgba(0,0,0,0.5)" />
      </g>
    )
  },
  blue: (cx, cy, s) => {
    const w = s * 0.5
    const gap = s * 0.14
    return (
      <g key="cbm">
        <line x1={cx - w / 2} y1={cy - gap} x2={cx + w / 2} y2={cy - gap} stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.1} />
        <line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.1} />
        <line x1={cx - w / 2} y1={cy + gap} x2={cx + w / 2} y2={cy + gap} stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.1} />
      </g>
    )
  },
  purple: (cx, cy, s) => {
    const r = s * 0.35
    const pts1 = Array.from({ length: 3 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 3 - Math.PI / 2
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    }).join(' ')
    const pts2 = Array.from({ length: 3 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 3 + Math.PI / 2
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    }).join(' ')
    return (
      <g key="cbm">
        <polygon points={pts1} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.1} />
        <polygon points={pts2} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.1} />
      </g>
    )
  },
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
  colourBlindMode?: boolean
}

export default function PlayerRack({ tiles, selectedIndex, tileFlipped, onSelect, onFlip, isMyTurn, colourBlindMode = false }: PlayerRackProps) {
  const hexSize = 28
  const hexHeight = hexSize * Math.sqrt(3) / 2
  // Center of each hex within its local transform group (path is drawn around hexSize/2, hexSize/2)
  const hexCx = hexSize / 2
  const hexCy = hexSize / 2
  // Circumradius used by CBM_SYMBOL (same as the hex corner distance)
  const hexRadius = hexSize / 2
  const tileWidth = hexSize + 2
  const tileHeight = hexHeight * 2 + 2

  return (
    <div className="flex portrait:flex-row landscape:flex-col items-center gap-3 justify-center portrait:flex-wrap landscape:flex-nowrap w-full">
      <div className="flex portrait:flex-row portrait:flex-wrap landscape:grid landscape:grid-cols-2 gap-2 items-center portrait:justify-center landscape:justify-items-center">
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
                  {colourBlindMode && CBM_SYMBOL[displayA as Color](hexCx, hexCy, hexRadius)}
                </g>
                {/* Bottom hexagon */}
                <g transform={`translate(0, ${hexHeight * 1.5})`}>
                  <path
                    d={getHexagonPath(hexSize)}
                    fill={COLOR_MAP[displayB]}
                    stroke={isSelected ? '#ffffff' : '#312e6b'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {colourBlindMode && CBM_SYMBOL[displayB as Color](hexCx, hexCy, hexRadius)}
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
    </div>
  )
}
