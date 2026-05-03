import type { Color, AxialCoord } from '@ingenious/shared'
import { hexToPixel } from './hexUtils'

const COLOR_MAP: Record<Color, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

interface FloatingLabel {
  color: Color
  points: number
  hex: AxialCoord
}

interface ScoreFloatsProps {
  labels: FloatingLabel[]
  animationKey: number
}

export default function ScoreFloats({ labels, animationKey }: ScoreFloatsProps) {
  return (
    <>
      {labels.map((label, i) => {
        const { x, y } = hexToPixel(label.hex.q, label.hex.r)
        const fill = COLOR_MAP[label.color]
        return (
          <text
            key={`${animationKey}-${i}`}
            x={x}
            y={y - 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={fill}
            stroke="#0f0e17"
            strokeWidth={3}
            paintOrder="stroke"
            fontSize={14}
            fontWeight="bold"
            style={{
              animation: `floatUp 1.5s ease-out 200ms both`,
              transformOrigin: `${x}px ${y}px`,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            +{label.points}
          </text>
        )
      })}
    </>
  )
}
