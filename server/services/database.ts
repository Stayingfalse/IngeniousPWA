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
`)

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
  insert: db.prepare('INSERT INTO lobbies (id, status, player_count, host_id) VALUES (?, ?, ?, ?)'),
  updateStatus: db.prepare('UPDATE lobbies SET status = ? WHERE id = ?'),
  setStarted: db.prepare('UPDATE lobbies SET status = ?, started_at = unixepoch() WHERE id = ?'),
  setFinished: db.prepare('UPDATE lobbies SET status = ?, finished_at = unixepoch() WHERE id = ?'),
}

export const lobbyPlayerQueries = {
  findByLobby: db.prepare<[string], LobbyPlayerRow>('SELECT * FROM lobby_players WHERE lobby_id = ? ORDER BY seat_index'),
  insert: db.prepare('INSERT INTO lobby_players (lobby_id, player_id, seat_index) VALUES (?, ?, ?)'),
  delete: db.prepare('DELETE FROM lobby_players WHERE lobby_id = ? AND player_id = ?'),
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
}

export const gameResultQueries = {
  insert: db.prepare(
    'INSERT INTO game_results (id, lobby_id, winner_id, final_scores, move_count, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  findRecent: db.prepare<[], GameResultRow>(
    `SELECT gr.*, p.display_name as winner_name
     FROM game_results gr
     LEFT JOIN players p ON gr.winner_id = p.id
     ORDER BY gr.finished_at DESC
     LIMIT 20`,
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

export default db
