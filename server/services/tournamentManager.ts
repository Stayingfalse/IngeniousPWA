import { WebSocket } from '@fastify/websocket'
import { v4 as uuidv4 } from 'uuid'
import type {
  TournamentState,
  TournamentFormat,
  TournamentStanding,
  TournamentMatch,
  TournamentRound,
  TurnMode,
  PlayerInfo,
  ServerMessage,
  GameResults,
} from '@ingenious/shared'
import { COLORS } from '@ingenious/shared'
import {
  tournamentQueries,
  tournamentPlayerQueries,
  tournamentRoundQueries,
  tournamentMatchQueries,
  tournamentMatchPlayerQueries,
  tournamentPlayerScoreQueries,
  tournamentStandingQueries,
  playerQueries,
} from './database'
import { splitIntoGroups, generateRoundRobinSchedule, generateSwissPairings, calculateTotalRounds } from './tournamentPairing'
import type { LobbyManager } from './lobbyManager'

interface InMemoryTournament {
  state: TournamentState
  connections: Map<string, WebSocket>
  lobbyMatchMap: Map<string, string>
}

class TournamentManager {
  private tournaments: Map<string, InMemoryTournament> = new Map()
  private lobbyManager!: LobbyManager

  setLobbyManager(lm: LobbyManager): void {
    this.lobbyManager = lm
  }

  private broadcastToTournament(tournamentId: string, msg: ServerMessage): void {
    const t = this.tournaments.get(tournamentId)
    if (!t) return
    for (const [, ws] of t.connections) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg))
      }
    }
  }

  private sendToPlayer(tournamentId: string, playerId: string, msg: ServerMessage): void {
    const t = this.tournaments.get(tournamentId)
    if (!t) return
    const ws = t.connections.get(playerId)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }

  private generateTournamentCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code: string
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    } while (this.tournaments.has(code))
    return code
  }

  private buildStandings(tournament: InMemoryTournament): TournamentStanding[] {
    return [...tournament.state.standings].sort((a, b) => {
      if (b.cumulativeMinScore !== a.cumulativeMinScore) return b.cumulativeMinScore - a.cumulativeMinScore
      return b.cumulativeTotalScore - a.cumulativeTotalScore
    })
  }

  getTournament(id: string): InMemoryTournament | undefined {
    return this.tournaments.get(id.toUpperCase())
  }

  createTournament(
    hostId: string,
    hostName: string,
    format: TournamentFormat,
    maxPlayers: number,
    turnMode: TurnMode,
    turnLimitSeconds: number | null,
  ): { tournamentId: string } | { error: string } {
    const MAX_ROUND_ROBIN = 12
    const MAX_SWISS = 64
    if (format === 'round_robin' && maxPlayers > MAX_ROUND_ROBIN) {
      return { error: 'ROUND_ROBIN_MAX_12' }
    }
    if (maxPlayers > MAX_SWISS) {
      return { error: 'MAX_64_PLAYERS' }
    }
    if (maxPlayers < 2) {
      return { error: 'MIN_2_PLAYERS' }
    }

    const totalRounds = calculateTotalRounds(format, maxPlayers)
    const id = this.generateTournamentCode()

    const hostPlayerInfo: PlayerInfo = { id: hostId, name: hostName, seat: 0 }

    const initialStanding: TournamentStanding = {
      playerId: hostId,
      playerName: hostName,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      cumulativeMinScore: 0,
      cumulativeTotalScore: 0,
      eliminated: false,
    }

    const state: TournamentState = {
      id,
      hostId,
      format,
      status: 'registering',
      maxPlayers,
      totalRounds,
      turnMode,
      turnLimitSeconds,
      players: [hostPlayerInfo],
      rounds: [],
      standings: [initialStanding],
      currentRound: 0,
    }

    const t: InMemoryTournament = {
      state,
      connections: new Map(),
      lobbyMatchMap: new Map(),
    }
    this.tournaments.set(id, t)

    try {
      tournamentQueries.insert.run(id, hostId, format, 'registering', maxPlayers, totalRounds, turnMode, turnLimitSeconds)
      tournamentPlayerQueries.insert.run(id, hostId)
      tournamentStandingQueries.upsert.run(id, hostId, 0, 0, 0, 0, 0, 0)
    } catch (err) {
      console.error('[TournamentManager] Failed to persist tournament:', err)
    }

    return { tournamentId: id }
  }

  joinTournament(
    tournamentId: string,
    playerId: string,
    playerName: string,
    ws: WebSocket,
  ): { error?: string } {
    const t = this.getTournament(tournamentId)
    if (!t) return { error: 'TOURNAMENT_NOT_FOUND' }
    if (t.state.status !== 'registering') return { error: 'TOURNAMENT_ALREADY_STARTED' }
    if (t.state.players.length >= t.state.maxPlayers) return { error: 'TOURNAMENT_FULL' }

    const existing = t.state.players.find(p => p.id === playerId)
    if (!existing) {
      const seat = t.state.players.length
      const playerInfo: PlayerInfo = { id: playerId, name: playerName, seat }
      t.state.players.push(playerInfo)
      t.state.standings.push({
        playerId,
        playerName,
        wins: 0,
        losses: 0,
        gamesPlayed: 0,
        cumulativeMinScore: 0,
        cumulativeTotalScore: 0,
        eliminated: false,
      })

      try {
        tournamentPlayerQueries.insert.run(tournamentId.toUpperCase(), playerId)
        tournamentStandingQueries.upsert.run(tournamentId.toUpperCase(), playerId, 0, 0, 0, 0, 0, 0)
      } catch { /* non-critical */ }
    }

    t.connections.set(playerId, ws)

    const joinMsg: ServerMessage = {
      type: 'TOURNAMENT_JOINED',
      tournamentId: t.state.id,
      state: { ...t.state, standings: this.buildStandings(t) },
    }
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(joinMsg))
    }

    this.broadcastToTournament(t.state.id, {
      type: 'TOURNAMENT_STATE',
      state: { ...t.state, standings: this.buildStandings(t) },
    })

    return {}
  }

  startTournament(tournamentId: string, requestingPlayerId: string): { error?: string } {
    const t = this.getTournament(tournamentId)
    if (!t) return { error: 'TOURNAMENT_NOT_FOUND' }
    if (t.state.hostId !== requestingPlayerId) return { error: 'NOT_HOST' }
    if (t.state.status !== 'registering') return { error: 'TOURNAMENT_ALREADY_STARTED' }
    if (t.state.players.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' }

    t.state.status = 'in_progress'
    t.state.totalRounds = calculateTotalRounds(t.state.format, t.state.players.length)

    try {
      tournamentQueries.updateStatus.run('in_progress', t.state.id)
    } catch { /* non-critical */ }

    if (t.state.format === 'round_robin') {
      const schedule = generateRoundRobinSchedule(t.state.players.map(p => p.id))
      t.state.rounds = schedule.map((groups, i) => ({
        roundNumber: i + 1,
        matches: groups.map(group => ({
          matchId: uuidv4(),
          lobbyId: null,
          roundNumber: i + 1,
          playerIds: group,
          status: 'pending' as const,
          winnerId: null,
          playerScores: {},
        })),
        status: 'pending' as const,
      }))
    }

    this.startRound(t, 1)
    return {}
  }

  private startRound(t: InMemoryTournament, roundNumber: number): void {
    let round = t.state.rounds.find(r => r.roundNumber === roundNumber)

    if (!round) {
      const activePlayers = t.state.players
        .filter(p => !t.state.standings.find(s => s.playerId === p.id)?.eliminated)
        .map(p => p.id)

      const previousMatchups: Array<[string, string]> = []
      for (const r of t.state.rounds) {
        for (const m of r.matches) {
          for (let i = 0; i < m.playerIds.length; i++) {
            for (let j = i + 1; j < m.playerIds.length; j++) {
              previousMatchups.push([m.playerIds[i], m.playerIds[j]])
            }
          }
        }
      }

      const groups = generateSwissPairings(
        activePlayers,
        t.state.standings,
        previousMatchups,
      )

      round = {
        roundNumber,
        matches: groups.map(group => ({
          matchId: uuidv4(),
          lobbyId: null,
          roundNumber,
          playerIds: group,
          status: 'pending' as const,
          winnerId: null,
          playerScores: {},
        })),
        status: 'active' as const,
      }
      t.state.rounds.push(round)
    } else {
      round.status = 'active'
    }

    t.state.currentRound = roundNumber

    try {
      tournamentRoundQueries.insert.run(t.state.id, roundNumber, 'active')
    } catch { /* non-critical */ }

    for (const match of round.matches) {
      this.createMatchLobby(t, match)
    }

    this.broadcastToTournament(t.state.id, {
      type: 'TOURNAMENT_STATE',
      state: { ...t.state, standings: this.buildStandings(t) },
    })

    for (const player of t.state.players) {
      const myMatch = round.matches.find(m => m.playerIds.includes(player.id))
      this.sendToPlayer(t.state.id, player.id, {
        type: 'TOURNAMENT_ROUND_STARTED',
        roundNumber,
        myMatchId: myMatch?.matchId ?? null,
        myLobbyId: myMatch?.lobbyId ?? null,
      })
    }
  }

  private createMatchLobby(t: InMemoryTournament, match: TournamentMatch): void {
    if (!this.lobbyManager) return

    const lobby = this.lobbyManager.createTournamentLobby(
      match.playerIds.length,
      t.state.turnMode,
      t.state.turnLimitSeconds,
      t.state.id,
      match.matchId,
    )

    match.lobbyId = lobby.id
    match.status = 'active'
    t.lobbyMatchMap.set(lobby.id, match.matchId)

    try {
      tournamentMatchQueries.insert.run(match.matchId, t.state.id, match.roundNumber, lobby.id, 'active')
      for (const pid of match.playerIds) {
        tournamentMatchPlayerQueries.insert.run(match.matchId, pid)
      }
    } catch { /* non-critical */ }

    const playerNames: Record<string, string> = {}
    for (const pid of match.playerIds) {
      const player = t.state.players.find(p => p.id === pid)
      playerNames[pid] = player?.name ?? 'Player'
      const ws = t.connections.get(pid)
      if (ws) {
        this.lobbyManager.joinTournamentLobby(lobby.id, pid, playerNames[pid], ws)
      }
    }

    this.lobbyManager.startTournamentGame(lobby.id, playerNames)
  }

  onGameFinished(lobbyId: string, results: GameResults): void {
    for (const [, t] of this.tournaments) {
      const matchId = t.lobbyMatchMap.get(lobbyId)
      if (!matchId) continue

      let foundMatch: TournamentMatch | undefined
      let foundRound: TournamentRound | undefined
      for (const round of t.state.rounds) {
        const m = round.matches.find(m => m.matchId === matchId)
        if (m) {
          foundMatch = m
          foundRound = round
          break
        }
      }
      if (!foundMatch || !foundRound) continue

      for (const playerId of foundMatch.playerIds) {
        const playerScores = results.scores[playerId]
        const minS = playerScores ? Math.min(...COLORS.map(c => playerScores[c] ?? 0)) : 0
        const totalS = playerScores ? COLORS.reduce((sum, c) => sum + (playerScores[c] ?? 0), 0) : 0
        foundMatch.playerScores[playerId] = { minScore: minS, totalScore: totalS }
      }

      foundMatch.status = 'finished'
      foundMatch.winnerId = results.winner

      for (const playerId of foundMatch.playerIds) {
        const standing = t.state.standings.find(s => s.playerId === playerId)
        if (!standing) continue
        const score = foundMatch.playerScores[playerId]
        standing.gamesPlayed++
        standing.cumulativeMinScore += score?.minScore ?? 0
        standing.cumulativeTotalScore += score?.totalScore ?? 0
        if (results.winner === playerId) {
          standing.wins++
        } else if (results.winner !== null) {
          standing.losses++
        }
      }

      try {
        tournamentMatchQueries.updateStatus.run('finished', results.winner, matchId)
        for (const playerId of foundMatch.playerIds) {
          const score = foundMatch.playerScores[playerId]
          tournamentPlayerScoreQueries.upsert.run(matchId, playerId, score?.minScore ?? 0, score?.totalScore ?? 0)
        }
        for (const standing of t.state.standings) {
          tournamentStandingQueries.upsert.run(
            t.state.id, standing.playerId, standing.wins, standing.losses,
            standing.gamesPlayed, standing.cumulativeMinScore, standing.cumulativeTotalScore,
            standing.eliminated ? 1 : 0,
          )
        }
      } catch { /* non-critical */ }

      const roundDone = foundRound.matches.every(m => m.status === 'finished')
      if (roundDone) {
        foundRound.status = 'done'
        this.advanceRound(t)
      } else {
        this.broadcastToTournament(t.state.id, {
          type: 'TOURNAMENT_STATE',
          state: { ...t.state, standings: this.buildStandings(t) },
        })
      }

      return
    }
  }

  private advanceRound(t: InMemoryTournament): void {
    const nextRound = t.state.currentRound + 1
    if (nextRound > t.state.totalRounds) {
      t.state.status = 'finished'
      const finalStandings = this.buildStandings(t)

      try {
        tournamentQueries.setFinished.run(t.state.id)
      } catch { /* non-critical */ }

      this.broadcastToTournament(t.state.id, {
        type: 'TOURNAMENT_FINISHED',
        finalStandings,
      })
      this.broadcastToTournament(t.state.id, {
        type: 'TOURNAMENT_STATE',
        state: { ...t.state, standings: finalStandings },
      })
    } else {
      this.startRound(t, nextRound)
    }
  }

  handleForfeitGame(tournamentId: string, playerId: string, lobbyId: string): void {
    const t = this.getTournament(tournamentId)
    if (!t) return

    const matchId = t.lobbyMatchMap.get(lobbyId)
    if (!matchId) return

    for (const round of t.state.rounds) {
      const match = round.matches.find(m => m.matchId === matchId)
      if (match) {
        match.playerScores[playerId] = { minScore: 0, totalScore: 0 }
        break
      }
    }
  }

  handleForfeitTournament(tournamentId: string, playerId: string): void {
    const t = this.getTournament(tournamentId)
    if (!t) return

    const standing = t.state.standings.find(s => s.playerId === playerId)
    if (standing) {
      standing.eliminated = true
    }

    try {
      tournamentPlayerQueries.setEliminated.run(t.state.id, playerId)
    } catch { /* non-critical */ }

    this.broadcastToTournament(t.state.id, {
      type: 'TOURNAMENT_STATE',
      state: { ...t.state, standings: this.buildStandings(t) },
    })
  }

  reconnectPlayer(tournamentId: string, playerId: string, ws: WebSocket): void {
    const t = this.getTournament(tournamentId)
    if (!t) return
    t.connections.set(playerId, ws)
    const stateMsg: ServerMessage = {
      type: 'TOURNAMENT_STATE',
      state: { ...t.state, standings: this.buildStandings(t) },
    }
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(stateMsg))
    }
  }

  getActiveTournamentsForPlayer(playerId: string): TournamentState[] {
    const result: TournamentState[] = []
    for (const [, t] of this.tournaments) {
      if (t.state.status !== 'finished' && t.state.players.some(p => p.id === playerId)) {
        result.push({ ...t.state, standings: this.buildStandings(t) })
      }
    }
    return result
  }

  restoreFromDatabase(): void {
    try {
      const rows = tournamentQueries.findActive.all()
      for (const row of rows) {
        if (this.tournaments.has(row.id)) continue

        const playerRows = tournamentPlayerQueries.findByTournament.all(row.id)
        const standingRows = tournamentStandingQueries.findByTournament.all(row.id)
        const roundRows = tournamentRoundQueries.findByTournament.all(row.id)

        const players: PlayerInfo[] = playerRows.map((pr, idx) => {
          const p = playerQueries.findById.get(pr.player_id)
          return {
            id: pr.player_id,
            name: p?.display_name ?? `Player_${pr.player_id.slice(0, 6)}`,
            seat: idx,
          }
        })

        const standings: TournamentStanding[] = standingRows.map(sr => {
          const p = players.find(pl => pl.id === sr.player_id)
          return {
            playerId: sr.player_id,
            playerName: p?.name ?? 'Unknown',
            wins: sr.wins,
            losses: sr.losses,
            gamesPlayed: sr.games_played,
            cumulativeMinScore: sr.cumulative_min_score,
            cumulativeTotalScore: sr.cumulative_total_score,
            eliminated: sr.eliminated === 1,
          }
        })

        const rounds: TournamentRound[] = []
        for (const rr of roundRows) {
          const matchRows = tournamentMatchQueries.findByTournamentRound.all(row.id, rr.round_number)
          const matches: TournamentMatch[] = []
          for (const mr of matchRows) {
            const mpRows = tournamentMatchPlayerQueries.findByMatch.all(mr.id)
            const scoreRows = tournamentPlayerScoreQueries.findByMatch.all(mr.id)
            const playerScores: Record<string, { minScore: number; totalScore: number }> = {}
            for (const sr of scoreRows) {
              playerScores[sr.player_id] = { minScore: sr.min_score, totalScore: sr.total_score }
            }
            matches.push({
              matchId: mr.id,
              lobbyId: mr.lobby_id,
              roundNumber: mr.round_number,
              playerIds: mpRows.map(mp => mp.player_id),
              status: mr.status as 'pending' | 'active' | 'finished',
              winnerId: mr.winner_id,
              playerScores,
            })
          }
          rounds.push({
            roundNumber: rr.round_number,
            matches,
            status: rr.status as 'pending' | 'active' | 'done',
          })
        }

        const state: TournamentState = {
          id: row.id,
          hostId: row.host_id,
          format: row.format as TournamentFormat,
          status: row.status as 'registering' | 'in_progress' | 'finished',
          maxPlayers: row.max_players,
          totalRounds: row.total_rounds,
          turnMode: row.turn_mode as TurnMode,
          turnLimitSeconds: row.turn_limit_seconds,
          players,
          rounds,
          standings,
          currentRound: rounds.filter(r => r.status !== 'pending').length,
        }

        const t: InMemoryTournament = {
          state,
          connections: new Map(),
          lobbyMatchMap: new Map(),
        }

        for (const round of rounds) {
          for (const match of round.matches) {
            if (match.lobbyId && match.status === 'active') {
              t.lobbyMatchMap.set(match.lobbyId, match.matchId)
            }
          }
        }

        this.tournaments.set(row.id, t)
      }
    } catch (err) {
      console.error('[TournamentManager] Failed to restore from database:', err)
    }
  }
}

export const tournamentManager = new TournamentManager()
