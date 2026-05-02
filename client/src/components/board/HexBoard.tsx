import { useState, useCallback, useMemo } from 'react'
import type { Color, Tile, AxialCoord } from '@ingenious/shared'
import { allHexes, startSymbolPositions, key, isAdjacent, inBounds, getLegalPlacements } from '@ingenious/shared'
import HexCell from './HexCell'
import TileGhost from './TileGhost'

const HEX_SIZE = 28

function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (3 / 2) * q
  const y = HEX_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r)
  return { x, y }
}


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
}: HexBoardProps) {
  const [hoveredHex, setHoveredHex] = useState<AxialCoord | null>(null)
  const [firstHex, setFirstHex] = useState<AxialCoord | null>(null)

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
      if (board[key(coord)] !== undefined) return

      if (!firstHex) {
        setFirstHex(coord)
      } else {
        if (isAdjacent(firstHex, coord) && board[key(coord)] === undefined) {
          onTilePlaced(selectedTileIndex, firstHex, coord)
          setFirstHex(null)
        } else {
          // Restart selection
          setFirstHex(coord)
        }
      }
    },
    [isMyTurn, selectedTileIndex, board, firstHex, onTilePlaced],
  )

  const handleHexHover = useCallback(
    (coord: AxialCoord | null) => {
      setHoveredHex(coord)
    },
    [],
  )

  const selectedTile = selectedTileIndex !== null ? myRack[selectedTileIndex] : null

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
  const ghostHexA = firstHex
  const ghostHexB =
    firstHex && hoveredHex && isAdjacent(firstHex, hoveredHex) && board[key(hoveredHex)] === undefined
      ? hoveredHex
      : null

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

        return (
          <HexCell
            key={k}
            x={x}
            y={y}
            size={HEX_SIZE - 1}
            color={color}
            isStart={isStart && !color}
            isSelectable={isMyTurn && selectedTileIndex !== null && !color}
            isFirstSelected={!!isFirstSelected}
            isValidTarget={!color && !isFirstSelected && validTargetKeys.has(k)}
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
    </svg>
  )
}
