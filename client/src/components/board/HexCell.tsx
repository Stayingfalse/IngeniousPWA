import type { Color } from '@ingenious/shared'

const COLOR_MAP: Record<Color, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
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
    </g>
  )
}
