import type { Color } from '@ingenious/shared'
import { lobbyManager } from '../services/lobbyManager'
import { gameResultQueries } from '../services/database'
import { AI_PLAYER_ID } from '../services/aiPlayer'

const COLOR_EMOJI: Record<Color, string> = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣',
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatScores(scores: Record<Color, number>): string {
  return (Object.keys(COLOR_EMOJI) as Color[])
    .map(c => `${COLOR_EMOJI[c]}${scores[c] ?? 0}`)
    .join(' ')
}

export interface OgMeta {
  title: string
  description: string
  imageUrl: string
}

/** Build OG metadata for a given join code, or null to use the page defaults. */
export function buildOgMeta(joinCode: string, baseUrl: string): OgMeta {
  const iconUrl = `${baseUrl}/icon-512.png`
  const code = joinCode.toUpperCase().trim()
  const lobby = lobbyManager.getLobby(code)

  // ── Case: lobby not found in memory ──────────────────────────────────────
  if (!lobby) {
    // Check whether the game ever existed and has a DB result
    const result = gameResultQueries.findByLobby.get(code)
    if (result) {
      const winner = result.winner_name ?? 'Someone'
      return {
        title: `🏆 ${winner} just won an Ingenious game!`,
        description: `This game has ended after ${result.move_count ?? '?'} moves. Start your own and challenge a friend!`,
        imageUrl: iconUrl,
      }
    }
    return {
      title: '🎲 Ingenious — Multiplayer Hex Board Game',
      description: 'This game link has expired or is invalid. Create your own lobby and challenge your friends!',
      imageUrl: iconUrl,
    }
  }

  const playerNames = lobby.players
    .filter(p => p.id !== AI_PLAYER_ID)
    .map(p => p.name)

  const modeLabel = lobby.turnMode === 'async' ? 'Turn-based' : 'Real-time'

  // ── Case: waiting ─────────────────────────────────────────────────────────
  if (lobby.status === 'waiting') {
    const host = lobby.players.find(p => p.id === lobby.hostId)
    const hostName = host?.name ?? 'Someone'
    const filled = lobby.players.filter(p => p.id !== AI_PLAYER_ID).length
    const slots = `${filled}/${lobby.maxPlayers}`
    const spotsLeft = lobby.maxPlayers - filled
    const urgency = spotsLeft === 1 ? '1 spot left!' : `${spotsLeft} spots left`
    return {
      title: `🎯 Join ${hostName}'s Ingenious game!`,
      description: `${modeLabel} · ${slots} players · ${urgency} — tap to join now`,
      imageUrl: iconUrl,
    }
  }

  // ── Case: in_progress ─────────────────────────────────────────────────────
  if (lobby.status === 'in_progress' && lobby.gameRoom) {
    const state = lobby.gameRoom.getState()
    const scoreLines = lobby.players
      .filter(p => p.id !== AI_PLAYER_ID)
      .map(p => {
        const s = state.scores[p.id]
        return s ? `${p.name}: ${formatScores(s)}` : p.name
      })
    return {
      title: `🔥 Ingenious in progress — spectate now!`,
      description: `${modeLabel} · ${playerNames.join(' vs ')}\n${scoreLines.join('\n')}`,
      imageUrl: iconUrl,
    }
  }

  // ── Case: finished (lobby still in memory briefly after game ends) ─────────
  if (lobby.status === 'finished') {
    const result = gameResultQueries.findByLobby.get(code)
    const winner = result?.winner_name ?? 'Someone'
    return {
      title: `🏆 ${winner} just won an Ingenious game!`,
      description: `${modeLabel} · ${playerNames.join(' vs ')} · Can you beat them? Play now →`,
      imageUrl: iconUrl,
    }
  }

  // Fallback
  return buildDefaultOgMeta(baseUrl)
}

export function buildDefaultOgMeta(baseUrl: string): OgMeta {
  return {
    title: '🎲 Ingenious — Multiplayer Hex Board Game',
    description: 'Play Ingenious free — strategic hex tile fun with friends. Create a lobby in seconds!',
    imageUrl: `${baseUrl}/icon-512.png`,
  }
}

/** Render OG + Twitter Card meta tags as an HTML string. */
export function renderOgTags(meta: OgMeta, pageUrl: string): string {
  const t = escapeHtml(meta.title)
  const d = escapeHtml(meta.description)
  const img = escapeHtml(meta.imageUrl)
  const url = escapeHtml(pageUrl)
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Ingenious" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="512" />`,
    `<meta property="og:image:height" content="512" />`,
    `<meta property="og:image:alt" content="Ingenious hex board game icon" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:image:alt" content="Ingenious hex board game icon" />`,
  ].join('\n    ')
}
