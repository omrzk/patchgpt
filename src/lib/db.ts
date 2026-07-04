import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { seedDemoData } from "./demo-data";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  os TEXT NOT NULL,
  role TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  criticality INTEGER NOT NULL DEFAULT 3,
  source TEXT NOT NULL DEFAULT 'demo',
  ip TEXT,
  cluster TEXT,
  internet_facing INTEGER NOT NULL DEFAULT 0,
  business_hours TEXT NOT NULL DEFAULT '08:00-18:00 Mon-Fri',
  uptime_days INTEGER NOT NULL DEFAULT 0,
  pending_reboot INTEGER NOT NULL DEFAULT 0,
  services TEXT NOT NULL DEFAULT '[]',
  last_scan TEXT
);

CREATE TABLE IF NOT EXISTS patches (
  kb TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  classification TEXT NOT NULL,
  products TEXT NOT NULL,
  release_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  requires_reboot INTEGER NOT NULL DEFAULT 1,
  size_mb REAL NOT NULL DEFAULT 0,
  known_issues TEXT NOT NULL DEFAULT '[]',
  breaking_changes TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS cves (
  id TEXT PRIMARY KEY,
  cvss REAL NOT NULL,
  severity TEXT NOT NULL,
  exploited INTEGER NOT NULL DEFAULT 0,
  public_poc INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS patch_cves (
  kb TEXT NOT NULL,
  cve_id TEXT NOT NULL,
  PRIMARY KEY (kb, cve_id)
);

CREATE TABLE IF NOT EXISTS server_patches (
  server_id TEXT NOT NULL,
  kb TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing',
  detected_at TEXT,
  installed_at TEXT,
  PRIMARY KEY (server_id, kb)
);

CREATE TABLE IF NOT EXISTS reboot_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  rebooted_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'success'
);

CREATE TABLE IF NOT EXISTS explanations (
  kb TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (db) return db;
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, "patchgpt.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  if (isDemoMode()) resetDemoIfStale(db);
  const count = db.prepare("SELECT COUNT(*) AS n FROM servers").get() as { n: number };
  if (count.n === 0) seedDemoData(db);
  return db;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

const DEMO_RESET_MS = 2 * 60 * 60 * 1000;
const ALL_TABLES = [
  "servers", "patches", "cves", "patch_cves", "server_patches",
  "reboot_history", "explanations", "plans", "reports", "settings",
];

/** In demo mode, wipe visitor-created plans/reports and reseed every 2 hours. */
function resetDemoIfStale(db: Database.Database) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'demo_seeded_at'").get() as
    | { value: string }
    | undefined;
  if (row && Date.now() - new Date(row.value).getTime() < DEMO_RESET_MS) return;
  for (const t of ALL_TABLES) db.exec(`DELETE FROM ${t}`);
  seedDemoData(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('demo_seeded_at', ?)").run(
    new Date().toISOString()
  );
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}
