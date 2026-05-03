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

// Same CBM symbols as HexCell – minimal inline version for ghost tiles
const CBM_SYMBOL: Record<Color, (cx: number, cy: number, size: number) => React.ReactNode> = {
  red: (cx, cy, s) => <circle key="cbm" cx={cx} cy={cy} r={s * 0.32} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.12} />,
  orange: (cx, cy, s) => {
    const h = s * 0.3
    return <rect key="cbm" x={cx - h} y={cy - h} width={h * 2} height={h * 2} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.12} transform={`rotate(45 ${cx} ${cy})`} />
  },
  yellow: (cx, cy, s) => {
    const h = s * 0.36
    const pts = `${cx},${cy - h} ${cx - h * 0.87},${cy + h * 0.5} ${cx + h * 0.87},${cy + h * 0.5}`
    return <polygon key="cbm" points={pts} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.12} />
  },
  green: (cx, cy, s) => {
    const arm = s * 0.3; const thick = s * 0.1
    return <g key="cbm"><rect x={cx - thick} y={cy - arm} width={thick * 2} height={arm * 2} fill="rgba(0,0,0,0.4)" /><rect x={cx - arm} y={cy - thick} width={arm * 2} height={thick * 2} fill="rgba(0,0,0,0.4)" /></g>
  },
  blue: (cx, cy, s) => {
    const w = s * 0.5; const gap = s * 0.14
    return <g key="cbm"><line x1={cx - w / 2} y1={cy - gap} x2={cx + w / 2} y2={cy - gap} stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.1} /><line x1={cx - w / 2} y1={cy} x2={cx + w / 2} y2={cy} stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.1} /><line x1={cx - w / 2} y1={cy + gap} x2={cx + w / 2} y2={cy + gap} stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.1} /></g>
  },
  purple: (cx, cy, s) => {
    const r = s * 0.35
    const pts1 = Array.from({ length: 3 }, (_, i) => { const a = (Math.PI * 2 * i) / 3 - Math.PI / 2; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}` }).join(' ')
    const pts2 = Array.from({ length: 3 }, (_, i) => { const a = (Math.PI * 2 * i) / 3 + Math.PI / 2; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}` }).join(' ')
    return <g key="cbm"><polygon points={pts1} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.1} /><polygon points={pts2} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={s * 0.1} /></g>
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

interface TileGhostProps {
  x: number
  y: number
  size: number
  color: Color
  colourBlindMode?: boolean
}

export default function TileGhost({ x, y, size, color, colourBlindMode = false }: TileGhostProps) {
  const points = hexCornerPoints(x, y, size)
  const fill = COLOR_MAP[color]

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={points}
        fill={fill}
        opacity={0.6}
        stroke="white"
        strokeWidth={2}
      />
      {colourBlindMode && CBM_SYMBOL[color](x, y, size)}
    </g>
  )
}

