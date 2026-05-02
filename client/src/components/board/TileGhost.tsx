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

interface TileGhostProps {
  x: number
  y: number
  size: number
  color: Color
}

export default function TileGhost({ x, y, size, color }: TileGhostProps) {
  const points = hexCornerPoints(x, y, size)
  const fill = COLOR_MAP[color]

  return (
    <polygon
      points={points}
      fill={fill}
      opacity={0.6}
      stroke="white"
      strokeWidth={2}
      style={{ pointerEvents: 'none' }}
    />
  )
}
