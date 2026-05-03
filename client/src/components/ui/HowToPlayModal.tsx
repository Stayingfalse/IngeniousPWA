interface HowToPlayModalProps {
  onClose: () => void
}

const SECTION_TITLE = 'text-base font-semibold text-purple-300 mb-1'
const SECTION_BODY = 'text-gray-300 text-sm leading-relaxed'

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#1a1833] rounded-2xl w-full max-w-md border border-[#312e6b] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#312e6b]">
          <h2 className="text-xl font-bold text-white">How to Play</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          <section>
            <h3 className={SECTION_TITLE}>🎯 Objective</h3>
            <p className={SECTION_BODY}>
              Be the first to reach a score of <strong className="text-white">18</strong> in all six colours — or have the highest <em>minimum</em> colour score when no more tiles can be played.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>🔷 The Board</h3>
            <p className={SECTION_BODY}>
              The game is played on a hexagonal grid. Each hex can hold one coloured tile end. There is a special <strong className="text-white">start hex</strong> in the centre; the first tile played each game must cover it.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>🃏 Tiles</h3>
            <p className={SECTION_BODY}>
              Each tile has <strong className="text-white">two coloured ends</strong>. On your turn, pick a tile from your rack and place it on any two adjacent empty hexes that are connected to the existing tiles on the board (or the start hex on the first move). You can tap the tile again to <strong className="text-white">flip</strong> its orientation.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>📊 Scoring</h3>
            <p className={SECTION_BODY}>
              After placing a tile, for <strong className="text-white">each end</strong> of the tile you score one point per matching-coloured hex in a straight line outward from that end (up to 18). Six colours are tracked independently.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>⚡ Ingenious!</h3>
            <p className={SECTION_BODY}>
              If any colour score reaches exactly <strong className="text-white">18</strong> from a single placement, it's called <em>Ingenious</em>! You immediately earn a <strong className="text-white">bonus turn</strong>.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>🔄 Rack Swap</h3>
            <p className={SECTION_BODY}>
              If it is your turn and none of your tiles contain your <strong className="text-white">lowest-scoring colour</strong>, you may swap your entire rack for a new set of tiles drawn from the bag.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>🏆 Winning</h3>
            <p className={SECTION_BODY}>
              The game ends when a player scores 18 in all colours, or when no valid moves remain. The winner is the player whose <strong className="text-white">lowest colour score is highest</strong>.
            </p>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>🖥️ Controls</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
              <li><strong className="text-white">Select a tile</strong> from your rack at the bottom (or left side in landscape).</li>
              <li><strong className="text-white">Tap the tile again</strong> to flip it.</li>
              <li><strong className="text-white">Tap a hex</strong> on the board to place the tile (the second hex is chosen automatically based on your drag/tap direction).</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#312e6b]">
          <button
            onClick={onClose}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
