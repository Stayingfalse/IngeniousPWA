import { useState } from 'react'

const STEPS = [
  {
    title: 'Welcome to Ingenious!',
    body: 'This quick guide will walk you through the basics. Tap "Next" to continue.',
    emoji: '👋',
  },
  {
    title: 'The Board',
    body: 'The game is played on a hexagonal grid. The first tile of the game must cover the glowing start hex in the centre.',
    emoji: '🔷',
  },
  {
    title: 'Your Rack',
    body: 'Your tile rack is shown at the bottom (or left side in landscape). Each tile has two coloured ends. Tap a tile to select it; tap it again to flip its orientation.',
    emoji: '🃏',
  },
  {
    title: 'Placing a Tile',
    body: 'Once a tile is selected, tap any valid hex on the board to place it. The tile must connect to existing tiles (or the start hex on the first move).',
    emoji: '📍',
  },
  {
    title: 'Scoring',
    body: "For each coloured end you place, count matching-coloured hexes in a straight line outward — that's your score for that colour. There are six colours and each tracks separately up to 18.",
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
]

interface TutorialOverlayProps {
  onClose: () => void
}

export default function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

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
          <p className="text-gray-300 text-sm leading-relaxed">{current.body}</p>
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-[#0f0e17] border border-[#312e6b] transition-colors"
            >
              Back
            </button>
          )}
          {!isLast ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors"
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

        <button
          onClick={handleDone}
          className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
        >
          Skip tutorial
        </button>
      </div>
    </div>
  )
}
