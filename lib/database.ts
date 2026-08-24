import { env } from 'cloudflare:workers';
import type { EvidenceRecord, ScanRecord, SourceName, SourceStatus } from './backend-types';

type GossipEnv = {
  DB: D1Database;
  EVIDENCE: R2Bucket;
  BRAVE_SEARCH_API_KEY?: string;
  TEA_AUTHORIZED_ENDPOINT?: string;
  TEA_AUTHORIZED_TOKEN?: string;
};

export const runtimeEnv = env as unknown as GossipEnv;

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, first_name TEXT NOT NULL, age INTEGER NOT NULL, city TEXT NOT NULL, usernames_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS source_runs (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE, source TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, started_at TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, source TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL, source_url TEXT, confidence INTEGER NOT NULL DEFAULT 0, reasons_json TEXT NOT NULL DEFAULT '[]', captured_at TEXT NOT NULL, object_key TEXT, mime_type TEXT, dismissed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS profiles_session_idx ON profiles(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_session_idx ON scans(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS source_runs_scan_idx ON source_runs(scan_id);
CREATE INDEX IF NOT EXISTS evidence_scan_idx ON evidence(scan_id, created_at DESC);
`;

let schemaReady: Promise<void> | undefined;

export function database() {
  if (!runtimeEnv.DB) throw new Error('The DB binding is not configured.');
  return runtimeEnv.DB;
}

export function evidenceBucket() {
  if (!runtimeEnv.EVIDENCE) throw new Error('The EVIDENCE binding is not configured.');
  return runtimeEnv.EVIDENCE;
}

export async function ensureSchema() {
  schemaReady ??= database().exec(schema).then(() => undefined).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

type ScanRow = {
  id: string;
  status: ScanRecord['status'];
  created_at: string;
  completed_at: string | null;
  error: string | null;
  first_name: string;
  age: number;
  city: string;
  usernames_json: string;
};

type SourceRow = {
  id: string;
  scan_id: string;
  source: SourceName;
  status: SourceStatus;
  note: string;
  matches: number;
};

type EvidenceRow = {
  id: string;
  scan_id: string;
  source: SourceName;
  title: string;
  excerpt: string;
  source_url: string | null;
  confidence: number;
  reasons_json: string;
  captured_at: string;
  object_key: string | null;
  dismissed: number;
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function sourceRows(scanIds: string[], sessionId: string) {
  if (!scanIds.length) return [];
  const placeholders = scanIds.map(() => '?').join(',');
  const statement = database().prepare(`
    SELECT sr.id, sr.scan_id, sr.source, sr.status, sr.note,
      (SELECT COUNT(*) FROM evidence e WHERE e.scan_id = sr.scan_id AND e.source = sr.source) AS matches
    FROM source_runs sr JOIN scans s ON s.id = sr.scan_id
    WHERE s.session_id = ? AND sr.scan_id IN (${placeholders})
    ORDER BY sr.rowid ASC
  `).bind(sessionId, ...scanIds);
  return (await statement.all<SourceRow>()).results;
}

async function evidenceRows(scanIds: string[], sessionId: string) {
  if (!scanIds.length) return [];
  const placeholders = scanIds.map(() => '?').join(',');
  const statement = database().prepare(`
    SELECT id, scan_id, source, title, excerpt, source_url, confidence, reasons_json, captured_at, object_key, dismissed
    FROM evidence WHERE session_id = ? AND scan_id IN (${placeholders}) ORDER BY created_at DESC
  `).bind(sessionId, ...scanIds);
  return (await statement.all<EvidenceRow>()).results;
}

export async function hydrateScans(rows: ScanRow[], sessionId: string): Promise<ScanRecord[]> {
  const ids = rows.map((row) => row.id);
  const [sources, evidence] = await Promise.all([sourceRows(ids, sessionId), evidenceRows(ids, sessionId)]);

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    error: row.error,
    profile: {
      firstName: row.first_name,
      age: row.age,
      city: row.city,
      usernames: parseJsonArray(row.usernames_json),
    },
    sources: sources.filter((source) => source.scan_id === row.id).map((source) => ({
      id: source.id,
      name: source.source,
      status: source.status,
      note: source.note,
      matches: Number(source.matches),
    })),
    evidence: evidence.filter((item) => item.scan_id === row.id).map((item): EvidenceRecord => ({
      id: item.id,
      source: item.source,
      title: item.title,
      excerpt: item.excerpt,
      sourceUrl: item.source_url,
      confidence: item.confidence,
      reasons: parseJsonArray(item.reasons_json),
      capturedAt: item.captured_at,
      hasImage: Boolean(item.object_key),
      imageUrl: item.object_key ? `/api/evidence/${item.id}/asset` : null,
      dismissed: Boolean(item.dismissed),
    })),
  }));
}

export async function getScans(sessionId: string, scanId?: string) {
  await ensureSchema();
  const query = `
    SELECT s.id, s.status, s.created_at, s.completed_at, s.error,
      p.first_name, p.age, p.city, p.usernames_json
    FROM scans s JOIN profiles p ON p.id = s.profile_id
    WHERE s.session_id = ? ${scanId ? 'AND s.id = ?' : ''}
    ORDER BY s.created_at DESC LIMIT ${scanId ? 1 : 12}
  `;
  const statement = database().prepare(query).bind(...(scanId ? [sessionId, scanId] : [sessionId]));
  const rows = (await statement.all<ScanRow>()).results;
  return hydrateScans(rows, sessionId);
}
