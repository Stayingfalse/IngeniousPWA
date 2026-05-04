import { HEX_SIZE } from './hexUtils'

interface TilePlacementPopupProps {
  hexAPos: { x: number; y: number }
  hexBPos: { x: number; y: number }
  viewBox: { minX: number; maxX: number; minY: number; maxY: number }
  onFlip: () => void
  onConfirm: () => void
  onCancel: () => void
}

// Vertical half-height of a pointy-hex (distance from center to top/bottom vertex)
const HEX_HALF_HEIGHT = HEX_SIZE * Math.sqrt(3) / 2

export default function TilePlacementPopup({
  hexAPos,
  hexBPos,
  viewBox,
  onFlip,
  onConfirm,
  onCancel,
}: TilePlacementPopupProps) {
  // Scale up buttons on small screens for easier touch targets
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 640
  const scale = isSmallScreen ? 1.35 : 1.0

  const BTN_GAP = 38 * scale
  const BTN_R = 14 * scale
  const BG_W = 120 * scale
  const BG_H = 34 * scale

  const cx = (hexAPos.x + hexBPos.x) / 2
  // Position above the upper hex
  const topY = Math.min(hexAPos.y, hexBPos.y) - HEX_HALF_HEIGHT
  const cy = topY - 26 * scale  // gap between hex and popup

  // Clamp horizontally so the outermost button edge stays inside the SVG viewBox
  const halfSpan = BTN_GAP + BTN_R + 2
  const clampedCx = Math.max(viewBox.minX + halfSpan, Math.min(viewBox.maxX - halfSpan, cx))

  // Clamp vertically so the popup doesn't go above the top of the SVG viewBox
  const clampedCy = Math.max(viewBox.minY + BG_H / 2 + 2, cy)

  return (
    <g>
      {/* Shadow / backdrop */}
      <rect
        x={clampedCx - BG_W / 2}
        y={clampedCy - BG_H / 2}
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
        <circle cx={clampedCx - BTN_GAP} cy={clampedCy} r={BTN_R} fill="#dc2626" />
        <text
          x={clampedCx - BTN_GAP}
          y={clampedCy + 5 * scale}
          textAnchor="middle"
          fill="white"
          fontSize={15 * scale}
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
        <circle cx={clampedCx} cy={clampedCy} r={BTN_R} fill="#3b82f6" />
        <text
          x={clampedCx}
          y={clampedCy + 5 * scale}
          textAnchor="middle"
          fill="white"
          fontSize={15 * scale}
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
        <circle cx={clampedCx + BTN_GAP} cy={clampedCy} r={BTN_R} fill="#16a34a" />
        <text
          x={clampedCx + BTN_GAP}
          y={clampedCy + 5 * scale}
          textAnchor="middle"
          fill="white"
          fontSize={15 * scale}
          fontWeight="bold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ✓
        </text>
      </g>
    </g>
  )
}
