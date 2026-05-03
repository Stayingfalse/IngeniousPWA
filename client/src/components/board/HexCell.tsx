import type { Color } from '@ingenious/shared'
import React from 'react'

const COLOR_MAP: Record<Color, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

// Unique shape/symbol per colour for colour-blind mode
const CBM_SYMBOL: Record<Color, (cx: number, cy: number, size: number) => React.ReactNode> = {
  red: (cx, cy, s) => {
    // Circle
    const r = s * 0.32
    return <circle key="cbm" cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.12} />
  },
  orange: (cx, cy, s) => {
    // Diamond
    const h = s * 0.3
    return (
      <rect
        key="cbm"
        x={cx - h}
        y={cy - h}
        width={h * 2}
        height={h * 2}
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={s * 0.12}
        transform={`rotate(45 ${cx} ${cy})`}
      />
    )
  },
  yellow: (cx, cy, s) => {
    // Triangle
    const h = s * 0.36
    const pts = `${cx},${cy - h} ${cx - h * 0.87},${cy + h * 0.5} ${cx + h * 0.87},${cy + h * 0.5}`
    return <polygon key="cbm" points={pts} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={s * 0.12} />
  },
  green: (cx, cy, s) => {
    // Plus / cross
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
    // Three horizontal lines
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
    // Six-pointed star (two overlapping triangles)
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

function hexCornerPoints(cx: number, cy: number, size: number): string {
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    const px = cx + size * Math.cos(angle)
    const py = cy + size * Math.sin(angle)
    points.push(`${px},${py}`)
  }
  return points.join(' ')
}

interface HexCellProps {
  x: number
  y: number
  size: number
  color?: Color
  isStart?: boolean
  isSelectable?: boolean
  isFirstSelected?: boolean
  isValidTarget?: boolean
  isScoringRay?: boolean
  scoringColor?: Color
  scoringDelayMs?: number
  colourBlindMode?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function HexCell({
  x,
  y,
  size,
  color,
  isStart = false,
  isSelectable = false,
  isFirstSelected = false,
  isValidTarget = false,
  isScoringRay = false,
  scoringColor,
  scoringDelayMs = 0,
  colourBlindMode = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: HexCellProps) {
  const points = hexCornerPoints(x, y, size)

  let fill = '#1a1833'
  if (color) {
    fill = COLOR_MAP[color]
  } else if (isFirstSelected) {
    fill = 'rgba(168,85,247,0.5)'
  } else if (isValidTarget) {
    fill = 'rgba(168,85,247,0.15)'
  } else if (isStart) {
    fill = '#2d2a5a'
  }

  const stroke = isFirstSelected
    ? '#a855f7'
    : isValidTarget
      ? 'rgba(168,85,247,0.6)'
      : isSelectable
        ? 'rgba(168,85,247,0.3)'
        : '#312e6b'

  const ringColor = scoringColor ? COLOR_MAP[scoringColor] : '#ffffff'

  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: isSelectable && !color ? 'pointer' : 'default' }}
    >
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={isFirstSelected || isValidTarget ? 2 : 1}
      />

      {/* Colour blind mode: unique shape overlay for coloured cells */}
      {colourBlindMode && color && CBM_SYMBOL[color](x, y, size)}

      {/* Scoring animation: bright flash + expanding ring */}
      {isScoringRay && (
        <>
          {/* Solid colour flash */}
          <polygon
            points={points}
            fill={ringColor}
            style={{
              opacity: 0,
              animation: `scoring-flash 1.8s ease-out ${scoringDelayMs}ms both`,
              transformOrigin: `${x}px ${y}px`,
              pointerEvents: 'none',
            }}
          />
          {/* Expanding bold ring */}
          <polygon
            points={hexCornerPoints(x, y, size + 2)}
            fill="none"
            stroke={ringColor}
            strokeWidth={6}
            style={{
              opacity: 0,
              animation: `scoring-ring-expand 1.8s ease-out ${scoringDelayMs}ms both`,
              transformOrigin: `${x}px ${y}px`,
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </g>
  )
}

