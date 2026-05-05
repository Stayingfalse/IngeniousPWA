import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'ingenious.db')

// Ensure data directory exists
const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS lobbies (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'waiting',
    player_count INTEGER NOT NULL,
    host_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    started_at INTEGER,
    finished_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS lobby_players (
    lobby_id TEXT,
    player_id TEXT,
    seat_index INTEGER NOT NULL,
    PRIMARY KEY (lobby_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS game_results (
    id TEXT PRIMARY KEY,
    lobby_id TEXT,
    winner_id TEXT,
    final_scores TEXT NOT NULL,
    move_count INTEGER,
    duration_seconds INTEGER,
    finished_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    player_id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS game_snapshots (
    lobby_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    player_names_json TEXT NOT NULL,
    snapshot_at INTEGER DEFAULT (unixepoch())
  );
`)

// ── Schema migrations ────────────────────────────────────────────────────────
// Add columns that may not exist in older databases (SQLite has no IF NOT EXISTS
// for ALTER TABLE, so we catch the error if the column already exists)
const migrations = [
  "ALTER TABLE lobbies ADD COLUMN turn_mode TEXT DEFAULT 'realtime'",
  'ALTER TABLE lobbies ADD COLUMN turn_limit_seconds INTEGER',
  'ALTER TABLE game_results ADD COLUMN win_reason TEXT',
  'ALTER TABLE lobbies ADD COLUMN auto_start INTEGER DEFAULT 0',
  'ALTER TABLE lobbies ADD COLUMN ai_difficulty TEXT',
]
for (const sql of migrations) {
  try {
    db.exec(sql)
  } catch {
    // Column already exists — ignore
  }
}

// ── VAPID keys ──────────────────────────────────────────────────────────────
// Loaded lazily so the rest of the app works even if web-push is not yet
// installed. Keys are auto-generated on first run and persisted to disk.

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

const VAPID_KEY_FILE = path.join(path.dirname(DB_PATH), 'vapid-keys.json')

function loadOrGenerateVapidKeys(): VapidKeys {
  // Prefer explicit env vars (useful in Docker)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    }
  }

  if (fs.existsSync(VAPID_KEY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VAPID_KEY_FILE, 'utf8')) as VapidKeys
    } catch {
      // Fall through to regenerate
    }
  }

  // Auto-generate via web-push
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push') as { generateVAPIDKeys(): VapidKeys }
    const keys = webpush.generateVAPIDKeys()
    fs.writeFileSync(VAPID_KEY_FILE, JSON.stringify(keys, null, 2))
    return keys
  } catch {
    // web-push not installed or generation failed — push notifications disabled
    return { publicKey: '', privateKey: '' }
  }
}

export const vapidKeys: VapidKeys = loadOrGenerateVapidKeys()

// ── Row types ────────────────────────────────────────────────────────────────

export interface PlayerRow {
  id: string
  display_name: string
  token: string
  created_at: number
}

export interface LobbyRow {
  id: string
  status: string
  player_count: number
  host_id: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  turn_mode: string | null
  turn_limit_seconds: number | null
  auto_start: number | null
  ai_difficulty: string | null
}

export interface LobbyPlayerRow {
  lobby_id: string
  player_id: string
  seat_index: number
}

export interface PushSubscriptionRow {
  player_id: string
  endpoint: string
  p256dh: string
  auth: string
  updated_at: number
}

// ── Prepared queries ─────────────────────────────────────────────────────────

export const playerQueries = {
  findByToken: db.prepare<[string], PlayerRow>('SELECT * FROM players WHERE token = ?'),
  findById: db.prepare<[string], PlayerRow>('SELECT * FROM players WHERE id = ?'),
  insert: db.prepare('INSERT INTO players (id, display_name, token) VALUES (?, ?, ?)'),
  updateName: db.prepare('UPDATE players SET display_name = ? WHERE id = ?'),
}

export const lobbyQueries = {
  findById: db.prepare<[string], LobbyRow>('SELECT * FROM lobbies WHERE id = ?'),
  insert: db.prepare('INSERT INTO lobbies (id, status, player_count, host_id, turn_mode, turn_limit_seconds, auto_start, ai_difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  updateStatus: db.prepare('UPDATE lobbies SET status = ? WHERE id = ?'),
  setStarted: db.prepare('UPDATE lobbies SET status = ?, started_at = unixepoch() WHERE id = ?'),
  setFinished: db.prepare('UPDATE lobbies SET status = ?, finished_at = unixepoch() WHERE id = ?'),
  updateAutoStart: db.prepare('UPDATE lobbies SET auto_start = ? WHERE id = ?'),
  delete: db.prepare('DELETE FROM lobbies WHERE id = ?'),
  findWaitingAsync: db.prepare<[], LobbyRow>("SELECT * FROM lobbies WHERE status = 'waiting' AND turn_mode = 'async'"),
}

export const lobbyPlayerQueries = {
  findByLobby: db.prepare<[string], LobbyPlayerRow>('SELECT * FROM lobby_players WHERE lobby_id = ? ORDER BY seat_index'),
  insert: db.prepare('INSERT INTO lobby_players (lobby_id, player_id, seat_index) VALUES (?, ?, ?)'),
  delete: db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND player_id = ?'),
  deleteByLobby: db.prepare('DELETE FROM lobby_players WHERE lobby_id = ?'),
  count: db.prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM lobby_players WHERE lobby_id = ?'),
}

export interface GameResultRow {
  id: string
  lobby_id: string
  winner_id: string | null
  final_scores: string
  move_count: number
  duration_seconds: number
  finished_at: number
  winner_name: string | null
  win_reason: string | null
}

export const gameResultQueries = {
  insert: db.prepare(
    'INSERT INTO game_results (id, lobby_id, winner_id, final_scores, move_count, duration_seconds, win_reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),
  findRecent: db.prepare<[], GameResultRow>(
    `SELECT gr.*, p.display_name as winner_name
     FROM game_results gr
     LEFT JOIN players p ON gr.winner_id = p.id
     ORDER BY gr.finished_at DESC
     LIMIT 20`,
  ),
  findByLobby: db.prepare<[string], GameResultRow>(
    `SELECT gr.*, p.display_name as winner_name
     FROM game_results gr
     LEFT JOIN players p ON gr.winner_id = p.id
     WHERE gr.lobby_id = ?
     LIMIT 1`,
  ),
}

export const pushSubscriptionQueries = {
  upsert: db.prepare(
    `INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(player_id) DO UPDATE SET endpoint=excluded.endpoint, p256dh=excluded.p256dh, auth=excluded.auth, updated_at=unixepoch()`,
  ),
  findByPlayer: db.prepare<[string], PushSubscriptionRow>(
    'SELECT * FROM push_subscriptions WHERE player_id = ?',
  ),
  delete: db.prepare('DELETE FROM push_subscriptions WHERE player_id = ?'),
}

export interface SnapshotRow {
  lobby_id: string
  state_json: string
  player_names_json: string
  snapshot_at: number
}

export const snapshotQueries = {
  upsert: db.prepare(
    `INSERT INTO game_snapshots (lobby_id, state_json, player_names_json, snapshot_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(lobby_id) DO UPDATE SET state_json=excluded.state_json, player_names_json=excluded.player_names_json, snapshot_at=unixepoch()`,
  ),
  findAll: db.prepare<[], SnapshotRow>('SELECT * FROM game_snapshots'),
  delete: db.prepare('DELETE FROM game_snapshots WHERE lobby_id = ?'),
}

export interface ActiveGameRow {
  lobby_id: string
  status: string
  turn_mode: string
  turn_limit_seconds: number | null
}

export const playerGameQueries = {
  findActiveForPlayer: db.prepare<[string], ActiveGameRow>(
    `SELECT lp.lobby_id, l.status, COALESCE(l.turn_mode, 'realtime') as turn_mode, l.turn_limit_seconds
     FROM lobby_players lp
     JOIN lobbies l ON l.id = lp.lobby_id
     WHERE lp.player_id = ? AND l.status = 'in_progress'`,
  ),
  findWaitingAsyncForPlayer: db.prepare<[string], ActiveGameRow>(
    `SELECT lp.lobby_id, l.status, COALESCE(l.turn_mode, 'realtime') as turn_mode, l.turn_limit_seconds
     FROM lobby_players lp
     JOIN lobbies l ON l.id = lp.lobby_id
     WHERE lp.player_id = ? AND l.status = 'waiting' AND l.turn_mode = 'async'`,
  ),
}

// ── Stats queries ─────────────────────────────────────────────────────────────

export interface PlayerStatRow {
  games_played: number
  games_won: number
  unique_opponents: number
  vs_computer_games: number
}

export const playerStatQueries = {
  getForPlayer: db.prepare<[string, string, string, string], PlayerStatRow>(
    `SELECT
       (SELECT COUNT(*) FROM game_results gr
        JOIN lobby_players lp ON lp.lobby_id = gr.lobby_id
        WHERE lp.player_id = ?) AS games_played,
       (SELECT COUNT(*) FROM game_results WHERE winner_id = ?) AS games_won,
       (SELECT COUNT(DISTINCT lp2.player_id)
        FROM lobby_players lp1
        JOIN lobby_players lp2 ON lp2.lobby_id = lp1.lobby_id AND lp2.player_id != lp1.player_id
        JOIN game_results gr ON gr.lobby_id = lp1.lobby_id
        WHERE lp1.player_id = ?) AS unique_opponents,
       (SELECT COUNT(*) FROM game_results gr
        JOIN lobby_players lp ON lp.lobby_id = gr.lobby_id
        WHERE lp.player_id = ?
          AND EXISTS (
            SELECT 1 FROM lobby_players lp_ai
            WHERE lp_ai.lobby_id = gr.lobby_id AND lp_ai.player_id = 'ai-computer-player'
          )) AS vs_computer_games`,
  ),
}

export interface PlayerGameResultRow {
  winner_id: string | null
}

export const playerStreakQueries = {
  getResults: db.prepare<[string], PlayerGameResultRow>(
    `SELECT gr.winner_id
     FROM game_results gr
     JOIN lobby_players lp ON lp.lobby_id = gr.lobby_id
     WHERE lp.player_id = ?
     ORDER BY gr.finished_at ASC`,
  ),
}

export interface MostCommonOpponentRow {
  name: string
  games: number
}

export const playerOpponentQueries = {
  getMostCommon: db.prepare<[string], MostCommonOpponentRow>(
    `SELECT p.display_name as name, COUNT(*) as games
     FROM lobby_players lp1
     JOIN lobby_players lp2 ON lp2.lobby_id = lp1.lobby_id AND lp2.player_id != lp1.player_id
     JOIN players p ON p.id = lp2.player_id
     JOIN game_results gr ON gr.lobby_id = lp1.lobby_id
     WHERE lp1.player_id = ?
       AND lp2.player_id != 'ai-computer-player'
     GROUP BY lp2.player_id
     ORDER BY games DESC
     LIMIT 1`,
  ),
}

export interface GlobalStatRow {
  total_games: number
  realtime_games: number
  async_games: number
  vs_computer_games: number
  won_by_all_eighteen: number
  won_by_no_moves: number
  won_by_forfeit: number
  wins_vs_easy: number
  total_vs_easy: number
  wins_vs_medium: number
  total_vs_medium: number
  wins_vs_hard: number
  total_vs_hard: number
}

export const globalStatQueries = {
  get: db.prepare<[], GlobalStatRow>(
    `SELECT
       COUNT(*) AS total_games,
       SUM(CASE WHEN COALESCE(l.turn_mode, 'realtime') = 'realtime' THEN 1 ELSE 0 END) AS realtime_games,
       SUM(CASE WHEN l.turn_mode = 'async' THEN 1 ELSE 0 END) AS async_games,
       SUM(CASE WHEN EXISTS (
         SELECT 1 FROM lobby_players lp_ai
         WHERE lp_ai.lobby_id = gr.lobby_id AND lp_ai.player_id = 'ai-computer-player'
       ) THEN 1 ELSE 0 END) AS vs_computer_games,
       SUM(CASE WHEN gr.win_reason = 'all_eighteen' THEN 1 ELSE 0 END) AS won_by_all_eighteen,
       SUM(CASE WHEN gr.win_reason = 'no_moves' THEN 1 ELSE 0 END) AS won_by_no_moves,
       SUM(CASE WHEN gr.win_reason = 'forfeit' THEN 1 ELSE 0 END) AS won_by_forfeit,
       SUM(CASE WHEN l.ai_difficulty = 'easy' AND gr.winner_id != 'ai-computer-player' AND gr.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS wins_vs_easy,
       SUM(CASE WHEN l.ai_difficulty = 'easy' THEN 1 ELSE 0 END) AS total_vs_easy,
       SUM(CASE WHEN l.ai_difficulty = 'medium' AND gr.winner_id != 'ai-computer-player' AND gr.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS wins_vs_medium,
       SUM(CASE WHEN l.ai_difficulty = 'medium' THEN 1 ELSE 0 END) AS total_vs_medium,
       SUM(CASE WHEN l.ai_difficulty = 'hard' AND gr.winner_id != 'ai-computer-player' AND gr.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS wins_vs_hard,
       SUM(CASE WHEN l.ai_difficulty = 'hard' THEN 1 ELSE 0 END) AS total_vs_hard
     FROM game_results gr
     LEFT JOIN lobbies l ON l.id = gr.lobby_id`,
  ),
}

export interface PlayerHistoryRow {
  id: string
  lobby_id: string
  winner_id: string | null
  winner_name: string | null
  move_count: number
  duration_seconds: number
  finished_at: number
  win_reason: string | null
  turn_mode: string | null
  ai_difficulty: string | null
  opponent_names: string | null
}

export const playerHistoryQueries = {
  getForPlayer: db.prepare<[string], PlayerHistoryRow>(
    `SELECT
       gr.id,
       gr.lobby_id,
       gr.winner_id,
       winner_p.display_name AS winner_name,
       gr.move_count,
       gr.duration_seconds,
       gr.finished_at,
       gr.win_reason,
       l.turn_mode,
       l.ai_difficulty,
       GROUP_CONCAT(
         CASE WHEN lp2.player_id != ?1 THEN COALESCE(p2.display_name, 'Unknown') END
       ) AS opponent_names
     FROM game_results gr
     JOIN lobby_players lp ON lp.lobby_id = gr.lobby_id AND lp.player_id = ?1
     LEFT JOIN players winner_p ON winner_p.id = gr.winner_id
     LEFT JOIN lobbies l ON l.id = gr.lobby_id
     LEFT JOIN lobby_players lp2 ON lp2.lobby_id = gr.lobby_id
     LEFT JOIN players p2 ON p2.id = lp2.player_id
     GROUP BY gr.id
     ORDER BY gr.finished_at DESC
     LIMIT 50`,
  ),
}

export default db
