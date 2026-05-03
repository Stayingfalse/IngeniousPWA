import { HEX_SIZE } from './hexUtils'

interface TilePlacementPopupProps {
  hexAPos: { x: number; y: number }
  hexBPos: { x: number; y: number }
  onFlip: () => void
  onConfirm: () => void
  onCancel: () => void
}

// Vertical half-height of a pointy-hex (distance from center to top/bottom vertex)
const HEX_HALF_HEIGHT = HEX_SIZE * Math.sqrt(3) / 2

export default function TilePlacementPopup({
  hexAPos,
  hexBPos,
  onFlip,
  onConfirm,
  onCancel,
}: TilePlacementPopupProps) {
  const cx = (hexAPos.x + hexBPos.x) / 2
  // Position above the upper hex
  const topY = Math.min(hexAPos.y, hexBPos.y) - HEX_HALF_HEIGHT
  const cy = topY - 26  // 26 = popup half-height + 4px gap

  const BTN_GAP = 38
  const BTN_R = 14
  const BG_W = 120
  const BG_H = 34

  return (
    <g>
      {/* Shadow / backdrop */}
      <rect
        x={cx - BG_W / 2}
        y={cy - BG_H / 2}
        width={BG_W}
        height={BG_H}
        rx={BG_H / 2}
        fill="#0f0e17"
        opacity={0.92}
        stroke="#a855f7"
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />

      {/* Cancel (✕) – red */}
      <g
        style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onCancel() }}
      >
        <circle cx={cx - BTN_GAP} cy={cy} r={BTN_R} fill="#dc2626" />
        <text
          x={cx - BTN_GAP}
          y={cy + 5}
          textAnchor="middle"
          fill="white"
          fontSize={15}
          fontWeight="bold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ✕
        </text>
      </g>

      {/* Flip (⇄) – blue */}
      <g
        style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onFlip() }}
      >
        <circle cx={cx} cy={cy} r={BTN_R} fill="#3b82f6" />
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill="white"
          fontSize={15}
          fontWeight="bold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ⇄
        </text>
      </g>

      {/* Confirm (✓) – green */}
      <g
        style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onConfirm() }}
      >
        <circle cx={cx + BTN_GAP} cy={cy} r={BTN_R} fill="#16a34a" />
        <text
          x={cx + BTN_GAP}
          y={cy + 5}
          textAnchor="middle"
          fill="white"
          fontSize={15}
          fontWeight="bold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ✓
        </text>
      </g>
    </g>
  )
}
