/**
 * Tournament pairing algorithms.
 */

export function splitIntoGroups(playerIds: string[], preferredSize = 4): string[][] {
  const n = playerIds.length
  if (n === 0) return []
  if (n <= 4) return [playerIds.slice()]

  const groups: string[][] = []
  let remaining = playerIds.slice()

  const rem = n % 4
  if (rem === 0) {
    // All groups of 4
  } else if (rem === 1) {
    groups.push(remaining.splice(0, 2))
    groups.push(remaining.splice(0, 3))
  } else if (rem === 2) {
    if (n === 6) {
      groups.push(remaining.splice(0, 3))
      groups.push(remaining.splice(0, 3))
      return groups
    }
    const pair = remaining.splice(-2)
    while (remaining.length >= 4) {
      groups.push(remaining.splice(0, 4))
    }
    if (pair.length > 0) groups.push(pair)
    return groups
  } else { // rem === 3
    groups.push(remaining.splice(0, 3))
  }

  while (remaining.length >= 4) {
    groups.push(remaining.splice(0, 4))
  }

  return groups
}

export function generateRoundRobinSchedule(playerIds: string[]): string[][][] {
  const n = playerIds.length
  if (n < 2) return []

  const groupSize = 4
  const totalRounds = Math.ceil((n - 1) / (groupSize - 1))

  const rounds: string[][][] = []
  const players = playerIds.slice()

  for (let round = 0; round < totalRounds; round++) {
    const rotated = [players[0]]
    const rest = players.slice(1)
    const shift = (round * (groupSize - 1)) % rest.length
    const rotRest = [...rest.slice(shift), ...rest.slice(0, shift)]
    rotated.push(...rotRest)

    const groups = splitIntoGroups(rotated, groupSize)
    rounds.push(groups)
  }

  return rounds
}

export function generateSwissPairings(
  playerIds: string[],
  standings: Array<{ playerId: string; cumulativeMinScore: number; cumulativeTotalScore: number }>,
  _previousMatchups: Array<[string, string]>,
): string[][] {
  const sorted = [...playerIds].sort((a, b) => {
    const sa = standings.find(s => s.playerId === a)
    const sb = standings.find(s => s.playerId === b)
    if (!sa || !sb) return 0
    if (sb.cumulativeMinScore !== sa.cumulativeMinScore) return sb.cumulativeMinScore - sa.cumulativeMinScore
    return sb.cumulativeTotalScore - sa.cumulativeTotalScore
  })

  return splitIntoGroups(sorted, 4)
}

export function calculateTotalRounds(format: 'round_robin' | 'swiss', playerCount: number): number {
  if (format === 'round_robin') {
    return Math.ceil((playerCount - 1) / 3)
  } else {
    return Math.min(8, Math.ceil(Math.log2(playerCount)))
  }
}
