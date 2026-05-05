import { useState, useEffect } from 'react'
import type { AxialCoord } from '@ingenious/shared'
import { allHexes, isAdjacent, key } from '@ingenious/shared'

// ── Mini-board helpers ────────────────────────────────────────────────────────

const MINI_SIZE = 22
const MINI_RADIUS = 1
const MINI_HEXES = allHexes(MINI_RADIUS)
/** Center hex is pre-filled to give the player an anchor to place adjacent to. */
const MINI_PREFILLED: Record<string, string> = { '0,0': 'green' }

const COLOUR_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

const DEMO_A = 'red'
const DEMO_B = 'blue'

function miniPixel(q: number, r: number) {
  return {
    x: MINI_SIZE * 1.5 * q,
    y: MINI_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r),
  }
}

function miniCorners(cx: number, cy: number, size: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return `${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`
  }).join(' ')
}

// ── Interactive placement mini-board ─────────────────────────────────────────

type Phase =
  | { step: 'idle' }
  | { step: 'first'; hexA: AxialCoord }
  | { step: 'confirm'; hexA: AxialCoord; hexB: AxialCoord }
  | { step: 'placed'; hexA: AxialCoord; hexB: AxialCoord; cA: string; cB: string }

function MiniBoard({ onPlaced }: { onPlaced: () => void }) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [flipped, setFlipped] = useState(false)

  const cA = flipped ? DEMO_B : DEMO_A
  const cB = flipped ? DEMO_A : DEMO_B

  const board: Record<string, string> = { ...MINI_PREFILLED }
  if (phase.step === 'placed') {
    board[key(phase.hexA)] = phase.cA
    board[key(phase.hexB)] = phase.cB
  }

  const handleHex = (coord: AxialCoord) => {
    if (board[key(coord)] !== undefined) return
    if (phase.step === 'idle') {
      setPhase({ step: 'first', hexA: coord })
    } else if (phase.step === 'first') {
      if (isAdjacent(phase.hexA, coord)) {
        setPhase({ step: 'confirm', hexA: phase.hexA, hexB: coord })
      } else {
        // Restart selection with the newly tapped hex
        setPhase({ step: 'first', hexA: coord })
      }
    }
    // Ignore clicks in confirm/placed phases
  }

  const handleConfirm = () => {
    if (phase.step !== 'confirm') return
    setPhase({ step: 'placed', hexA: phase.hexA, hexB: phase.hexB, cA, cB })
    onPlaced()
  }

  const handleCancel = () => {
    setPhase({ step: 'idle' })
    setFlipped(false)
  }

  const HEX_HALF_H = MINI_SIZE * (Math.sqrt(3) / 2)

  let instruction: string
  if (phase.step === 'idle') instruction = '👆 Tap an empty hex to place the Red end'
  else if (phase.step === 'first') instruction = '👆 Now tap an adjacent hex for the Blue end'
  else if (phase.step === 'confirm') instruction = '✕ cancel  ·  ⇄ flip colours  ·  ✓ confirm'
  else instruction = '✅ Tile placed! Tap Next to continue.'

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Tile preview */}
      {phase.step !== 'placed' && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-400">Your tile:</span>
          <span className="px-2 py-0.5 rounded font-bold text-white" style={{ background: COLOUR_HEX[cA] }}>
            {cA[0].toUpperCase() + cA.slice(1)}
          </span>
          <span className="text-gray-400">+</span>
          <span className="px-2 py-0.5 rounded font-bold text-white" style={{ background: COLOUR_HEX[cB] }}>
            {cB[0].toUpperCase() + cB.slice(1)}
          </span>
        </div>
      )}

      {/* Instruction text */}
      <p className={`text-xs text-center min-h-[1.5rem] leading-snug ${phase.step === 'placed' ? 'text-green-400 font-medium' : 'text-gray-300'}`}>
        {instruction}
      </p>

      {/* SVG mini board — viewBox leaves room above for the confirm popup */}
      <svg viewBox="-65 -95 130 215" style={{ width: 200, height: 185 }}>
        {MINI_HEXES.map(hex => {
          const { x, y } = miniPixel(hex.q, hex.r)
          const k = key(hex)
          const filledColor = board[k]
          const isGhostA = !filledColor &&
            (phase.step === 'first' || phase.step === 'confirm') &&
            'hexA' in phase && key(phase.hexA) === k
          const isGhostB = !filledColor && phase.step === 'confirm' && key(phase.hexB) === k
          const isFirstSel = phase.step === 'first' && key(phase.hexA) === k
          const clickable = !filledColor && phase.step !== 'confirm' && phase.step !== 'placed'

          let fill = '#1a1833'
          if (filledColor) fill = COLOUR_HEX[filledColor]
          else if (isGhostA) fill = COLOUR_HEX[cA] + '66'
          else if (isGhostB) fill = COLOUR_HEX[cB] + '66'

          const stroke = isFirstSel
            ? '#a855f7'
            : clickable
              ? 'rgba(168,85,247,0.45)'
              : '#312e6b'

          return (
            <g key={k} onClick={() => handleHex(hex)} style={{ cursor: clickable ? 'pointer' : 'default' }}>
              <polygon
                points={miniCorners(x, y, MINI_SIZE - 1)}
                fill={fill}
                stroke={stroke}
                strokeWidth={isFirstSel ? 2 : 1}
              />
              {(isGhostA || isGhostB) && (
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill={isGhostA ? COLOUR_HEX[cA] : COLOUR_HEX[cB]}
                  fontSize={9}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {isGhostA ? cA[0].toUpperCase() : cB[0].toUpperCase()}
                </text>
              )}
            </g>
          )
        })}

        {/* Confirm popup — appears above the selected hex pair */}
        {phase.step === 'confirm' && (() => {
          const aP = miniPixel(phase.hexA.q, phase.hexA.r)
          const bP = miniPixel(phase.hexB.q, phase.hexB.r)
          const pcx = (aP.x + bP.x) / 2
          const topY = Math.min(aP.y, bP.y) - HEX_HALF_H
          const pcy = topY - 22
          const BTN_GAP = 22
          const BTN_R = 11
          return (
            <g>
              <rect
                x={pcx - 60}
                y={pcy - 14}
                width={120}
                height={28}
                rx={14}
                fill="#0f0e17"
                opacity={0.93}
                stroke="#a855f7"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
              {/* Cancel (✕) */}
              <g style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); handleCancel() }}>
                <circle cx={pcx - BTN_GAP * 2} cy={pcy} r={BTN_R} fill="#dc2626" />
                <text
                  x={pcx - BTN_GAP * 2}
                  y={pcy + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >✕</text>
              </g>
              {/* Flip (⇄) */}
              <g style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setFlipped(f => !f) }}>
                <circle cx={pcx} cy={pcy} r={BTN_R} fill="#3b82f6" />
                <text
                  x={pcx}
                  y={pcy + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >⇄</text>
              </g>
              {/* Confirm (✓) */}
              <g style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); handleConfirm() }}>
                <circle cx={pcx + BTN_GAP * 2} cy={pcy} r={BTN_R} fill="#16a34a" />
                <text
                  x={pcx + BTN_GAP * 2}
                  y={pcy + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >✓</text>
              </g>
            </g>
          )
        })()}
      </svg>

      {/* Allow replaying after a successful placement */}
      {phase.step === 'placed' && (
        <button
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          onClick={() => { setPhase({ step: 'idle' }); setFlipped(false) }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

// ── Tutorial steps data ───────────────────────────────────────────────────────

interface TutorialStep {
  title: string
  body: string
  emoji: string
  interactive?: boolean
  cbmChoice?: boolean
}

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Ingenious!',
    body: 'This quick guide will walk you through the basics. Tap "Next" to continue.',
    emoji: '👋',
  },
  {
    title: 'The Board',
    body: 'The game is played on a hexagonal grid. There are 6 glowing start hexes around the edges of the board. Every player must cover a unique start hex on their very first move — no two players may share one.',
    emoji: '🔷',
  },
  {
    title: 'Your Rack',
    body: 'Your tile rack is shown at the bottom (or left side in landscape). Each tile has two coloured ends. Tap a tile to select it.',
    emoji: '🃏',
  },
  {
    title: 'Placing a Tile',
    body: 'With a tile selected, tap a valid hex for the first colour end, then tap an adjacent hex for the second colour end. A popup appears so you can flip the colours, cancel, or confirm the placement.',
    emoji: '📍',
  },
  {
    title: 'Try It!',
    body: '',
    emoji: '🎮',
    interactive: true,
  },
  {
    title: 'Scoring',
    body: "For each coloured end you place, count matching-coloured hexes in a straight line outward — that's your score for that colour. Six colours track separately, each up to 18.",
    emoji: '📊',
  },
  {
    title: '⚡ Ingenious!',
    body: 'Reach exactly 18 in a colour with one move and it\'s "Ingenious!" — you earn a bonus turn immediately.',
    emoji: '⚡',
  },
  {
    title: 'Winning',
    body: 'Win by reaching 18 in all six colours, or by having the highest minimum colour score when the tile bag runs out. Good luck!',
    emoji: '🏆',
  },
  {
    title: 'Colour Blind Mode',
    body: '',
    emoji: '◑',
    cbmChoice: true,
  },
]

// ── TutorialOverlay ───────────────────────────────────────────────────────────

interface TutorialOverlayProps {
  onClose: () => void
  colourBlindMode: boolean
  onToggleColourBlindMode: () => void
}

const INTERACTIVE_STEP_INDEX = STEPS.findIndex(s => s.interactive)
const CBM_STEP_INDEX = STEPS.findIndex(s => s.cbmChoice)

export default function TutorialOverlay({ onClose, colourBlindMode, onToggleColourBlindMode }: TutorialOverlayProps) {
  const [step, setStep] = useState(0)
  const [interactiveDone, setInteractiveDone] = useState(false)

  // Reset completion gate whenever the interactive step is (re-)entered
  useEffect(() => {
    if (step === INTERACTIVE_STEP_INDEX) setInteractiveDone(false)
  }, [step])

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isInteractive = current.interactive === true
  const isCbmChoice = current.cbmChoice === true
  const canAdvance = !isInteractive || interactiveDone

  const handleDone = () => {
    localStorage.setItem('hasSeenTutorial', '1')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1833] rounded-2xl p-6 w-full max-w-sm border border-[#312e6b] shadow-2xl">
        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`block w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-purple-400' : 'bg-[#312e6b]'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{current.emoji}</div>
          <h2 className="text-lg font-bold text-white mb-2">{current.title}</h2>
          {isInteractive ? (
            <MiniBoard onPlaced={() => setInteractiveDone(true)} />
          ) : isCbmChoice ? (
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-gray-300 leading-relaxed">
                Colour Blind Mode adds letter labels to every tile and hex colour, making it easier to play without relying on colour alone.
              </p>
              <p className="text-gray-400 leading-relaxed">
                It is currently{' '}
                <span className={`font-semibold ${colourBlindMode ? 'text-yellow-300' : 'text-gray-300'}`}>
                  {colourBlindMode ? 'ON' : 'OFF'}
                </span>
                . Would you like to keep it that way?
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { if (!colourBlindMode) onToggleColourBlindMode() }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    colourBlindMode
                      ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300'
                      : 'border-gray-600 text-gray-400 hover:border-yellow-400 hover:text-yellow-300'
                  }`}
                >
                  ◑ Keep On
                </button>
                <button
                  onClick={() => { if (colourBlindMode) onToggleColourBlindMode() }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    !colourBlindMode
                      ? 'bg-gray-500/20 border-gray-300 text-gray-200'
                      : 'border-gray-600 text-gray-400 hover:border-gray-300 hover:text-gray-200'
                  }`}
                >
                  Turn Off
                </button>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed mt-1">
                You can always change this later using the <span className="font-mono text-gray-300">◑</span> button in the top bar.
              </p>
            </div>
          ) : (
            <p className="text-gray-300 text-sm leading-relaxed">{current.body}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          {step > 0 && !isCbmChoice && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-[#0f0e17] border border-[#312e6b] transition-colors"
            >
              Back
            </button>
          )}
          {isCbmChoice ? (
            <button
              onClick={handleDone}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              Let's Play!
            </button>
          ) : !isLast ? (
            <button
              onClick={() => { if (canAdvance) setStep(s => s + 1) }}
              disabled={!canAdvance}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                canAdvance
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-[#312e6b] text-gray-500 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleDone}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
            >
              Let's Play!
            </button>
          )}
        </div>

        {!isCbmChoice && (
          <button
            onClick={handleDone}
            className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
          >
            Skip tutorial
          </button>
        )}
      </div>
    </div>
  )
}
