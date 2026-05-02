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
`)

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

export const gameResultQueries = {
  insert: db.prepare(
    'INSERT INTO game_results (id, lobby_id, winner_id, final_scores, move_count, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)',
  ),
}

export default db
