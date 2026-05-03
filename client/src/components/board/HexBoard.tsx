import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Color, Tile, AxialCoord } from '@ingenious/shared'
import { allHexes, startSymbolPositions, key, isAdjacent, inBounds, getLegalPlacements } from '@ingenious/shared'
import HexCell from './HexCell'
import TileGhost from './TileGhost'
import TilePlacementPopup from './TilePlacementPopup'
import ScoreFloats from './ScoreFloats'
import type { ScoringAnimation } from '../../store/gameStore'
import { HEX_SIZE, hexToPixel } from './hexUtils'

interface HexBoardProps {
  board: Record<string, Color>
  radius: number
  myRack: Tile[]
  selectedTileIndex: number | null
  tileFlipped: boolean
  isMyTurn: boolean
  isFirstMove: boolean
  usedStartSymbols: string[]
  onTilePlaced: (tileIndex: number, hexA: AxialCoord, hexB: AxialCoord) => void
  onFlip: () => void
  onCancelPlacement: () => void
  scoringAnimation: ScoringAnimation | null
}

export default function HexBoard({
  board,
  radius,
  myRack,
  selectedTileIndex,
  tileFlipped,
  isMyTurn,
  isFirstMove,
  usedStartSymbols,
  onTilePlaced,
  onFlip,
  onCancelPlacement,
  scoringAnimation,
}: HexBoardProps) {
  const [hoveredHex, setHoveredHex] = useState<AxialCoord | null>(null)
  const [firstHex, setFirstHex] = useState<AxialCoord | null>(null)
  const [pendingSecondHex, setPendingSecondHex] = useState<AxialCoord | null>(null)

  // Clear pending state when the selected tile changes
  useEffect(() => {
    setFirstHex(null)
    setPendingSecondHex(null)
  }, [selectedTileIndex])

  const hexes = allHexes(radius)
  const startSymbols = startSymbolPositions(radius)
  const startSymbolKeys = new Set(startSymbols.map(s => key(s)))

  // Compute viewBox
  const pixels = hexes.map(h => hexToPixel(h.q, h.r))
  const minX = Math.min(...pixels.map(p => p.x)) - HEX_SIZE
  const maxX = Math.max(...pixels.map(p => p.x)) + HEX_SIZE
  const minY = Math.min(...pixels.map(p => p.y)) - HEX_SIZE
  const maxY = Math.max(...pixels.map(p => p.y)) + HEX_SIZE

  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`

  const handleHexClick = useCallback(
    (coord: AxialCoord) => {
      if (!isMyTurn || selectedTileIndex === null) return
      // When popup is showing, ignore board clicks – use popup buttons instead
      if (pendingSecondHex) return
      if (board[key(coord)] !== undefined) return

      if (!firstHex) {
        setFirstHex(coord)
      } else {
        if (isAdjacent(firstHex, coord) && board[key(coord)] === undefined) {
          // Show confirmation popup instead of submitting immediately
          setPendingSecondHex(coord)
        } else {
          // Restart selection with the new hex
          setFirstHex(coord)
        }
      }
    },
    [isMyTurn, selectedTileIndex, board, firstHex, pendingSecondHex],
  )

  const handlePopupConfirm = useCallback(() => {
    if (firstHex && pendingSecondHex && selectedTileIndex !== null) {
      onTilePlaced(selectedTileIndex, firstHex, pendingSecondHex)
      setFirstHex(null)
      setPendingSecondHex(null)
    }
  }, [firstHex, pendingSecondHex, selectedTileIndex, onTilePlaced])

  const handlePopupCancel = useCallback(() => {
    setFirstHex(null)
    setPendingSecondHex(null)
    onCancelPlacement()
  }, [onCancelPlacement])

  const handleHexHover = useCallback(
    (coord: AxialCoord | null) => {
      setHoveredHex(coord)
    },
    [],
  )

  const selectedTile = selectedTileIndex !== null ? myRack[selectedTileIndex] : null

  // Build a map from hex key → { color, delayMs } for scoring ray highlights
  const scoringRayMap = useMemo(() => {
    const map = new Map<string, { color: Color; delayMs: number }>()
    if (!scoringAnimation) return map
    for (const ray of scoringAnimation.rayHexes) {
      for (const { coord, delayMs } of ray.cells) {
        map.set(key(coord), { color: ray.color, delayMs })
      }
    }
    return map
  }, [scoringAnimation?.startedAt])

  // When a tile is selected, compute every hex that is part of a legal placement
  const validTargetKeys = useMemo(() => {
    if (!isMyTurn || selectedTileIndex === null) return new Set<string>()
    const placements = getLegalPlacements(board, radius, isFirstMove, usedStartSymbols)
    const keys = new Set<string>()
    for (const { hexA, hexB } of placements) {
      keys.add(key(hexA))
      keys.add(key(hexB))
    }
    return keys
  }, [isMyTurn, selectedTileIndex, board, radius, isFirstMove, usedStartSymbols])

  // Determine ghost hexes
  // When pendingSecondHex is set (popup showing), lock ghosts at both positions
  const ghostHexA = firstHex
  const ghostHexB = pendingSecondHex ??
    (firstHex && hoveredHex && isAdjacent(firstHex, hoveredHex) && board[key(hoveredHex)] === undefined
      ? hoveredHex
      : null)

  return (
    <svg
      viewBox={viewBox}
      style={{ width: '100%', height: '100%', maxHeight: '100%' }}
      className="touch-none"
    >
      {hexes.map(hex => {
        const { x, y } = hexToPixel(hex.q, hex.r)
        const k = key(hex)
        const color = board[k]
        const isStart = startSymbolKeys.has(k)
        const isGhostA = ghostHexA && key(ghostHexA) === k
        const isGhostB = ghostHexB && key(ghostHexB) === k
        const isFirstSelected = firstHex && key(firstHex) === k
        const scoringRay = scoringRayMap.get(k)

        return (
          <HexCell
            key={k}
            x={x}
            y={y}
            size={HEX_SIZE - 1}
            color={color}
            isStart={isStart && !color}
            isSelectable={isMyTurn && selectedTileIndex !== null && !color && !pendingSecondHex}
            isFirstSelected={!!isFirstSelected && !pendingSecondHex}
            isValidTarget={!color && !isFirstSelected && !pendingSecondHex && validTargetKeys.has(k)}
            isScoringRay={!!scoringRay}
            scoringColor={scoringRay?.color}
            scoringDelayMs={scoringRay?.delayMs}
            onClick={() => handleHexClick(hex)}
            onMouseEnter={() => handleHexHover(hex)}
            onMouseLeave={() => handleHexHover(null)}
          />
        )
      })}

      {/* Ghost preview */}
      {selectedTile && ghostHexA && (() => {
        const { x: ax, y: ay } = hexToPixel(ghostHexA.q, ghostHexA.r)
        return (
          <TileGhost
            x={ax}
            y={ay}
            size={HEX_SIZE - 1}
            color={tileFlipped ? selectedTile.colorB : selectedTile.colorA}
          />
        )
      })()}
      {selectedTile && ghostHexB && (() => {
        const { x: bx, y: by } = hexToPixel(ghostHexB.q, ghostHexB.r)
        return (
          <TileGhost
            x={bx}
            y={by}
            size={HEX_SIZE - 1}
            color={tileFlipped ? selectedTile.colorA : selectedTile.colorB}
          />
        )
      })()}

      {/* Tile placement confirmation popup */}
      {firstHex && pendingSecondHex && (() => {
        const hexAPos = hexToPixel(firstHex.q, firstHex.r)
        const hexBPos = hexToPixel(pendingSecondHex.q, pendingSecondHex.r)
        return (
          <TilePlacementPopup
            hexAPos={hexAPos}
            hexBPos={hexBPos}
            onFlip={onFlip}
            onConfirm={handlePopupConfirm}
            onCancel={handlePopupCancel}
          />
        )
      })()}

      {/* Floating +n score labels */}
      {scoringAnimation && (
        <ScoreFloats
          labels={scoringAnimation.floatingLabels}
          animationKey={scoringAnimation.startedAt}
        />
      )}
    </svg>
  )
}
