/**
 * Storage for dsh-worklog: one SQLite file inside the DSH home directory.
 *
 * DatabaseSync comes from node:sqlite, which ships with Node — so the plugin
 * has no native dependency to build and no external service to reach. That is
 * what makes "install the plugin and it works" true.
 *
 * @module dsh-worklog/store
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Schema version; bump when a migration is added below. */
const SCHEMA_VERSION = 1

/**
 * Resolve the database path. DSH_HOME is honoured so a test or a second
 * profile never shares the real ledger.
 * @returns absolute path of the SQLite file.
 */
export function databasePath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'worklog', 'worklog.db')
}

/**
 * Tables the plugin owns. Every column the Python service used is kept, so a
 * future importer can read this file the same way.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#6366f1',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    done_criteria TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    due_time TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER NOT NULL DEFAULT 2,
    week_start TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    routine_id INTEGER,
    period_key TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_tasks_week ON tasks(week_start)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, archived)',
  `CREATE TABLE IF NOT EXISTS progress_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    link TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    done_criteria TEXT NOT NULL DEFAULT '',
    freq TEXT NOT NULL,
    due_rule TEXT NOT NULL DEFAULT 'period_end',
    due_day INTEGER,
    due_time TEXT,
    priority INTEGER NOT NULL DEFAULT 2,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    start_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
]

/**
 * Open (and on first use create) the database.
 * @param path - override for tests; defaults to the profile's own file.
 * @returns the open handle.
 */
export function openDatabase(path = databasePath()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  for (const statement of SCHEMA) db.exec(statement)
  db.exec(`INSERT INTO meta(key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
  return db
}

/**
 * Read one setting.
 * @param db - open handle.
 * @param key - setting name.
 * @param fallback - returned when the row is absent.
 * @returns the stored string or the fallback.
 */
export function getSetting(db, key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row === undefined ? fallback : String(row.value)
}

/**
 * Write one setting.
 * @param db - open handle.
 * @param key - setting name.
 * @param value - value to store.
 */
export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value))
}
