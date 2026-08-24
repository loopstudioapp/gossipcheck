PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  city TEXT NOT NULL,
  usernames_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS source_runs (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'unconfigured', 'failed')),
  note TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source_url TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  captured_at TEXT NOT NULL,
  object_key TEXT,
  mime_type TEXT,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_photos (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS profiles_session_idx ON profiles(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_session_idx ON scans(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS source_runs_scan_idx ON source_runs(scan_id);
CREATE INDEX IF NOT EXISTS evidence_scan_idx ON evidence(scan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_photos_session_idx ON scan_photos(session_id, created_at DESC);
