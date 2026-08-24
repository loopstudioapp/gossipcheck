import { env } from 'cloudflare:workers';
import type { EvidenceRecord, ScanRecord, SourceName, SourceStatus } from './backend-types';

type GossipEnv = {
  DB: D1Database;
  EVIDENCE: R2Bucket;
  BRAVE_SEARCH_API_KEY?: string;
  TEA_AUTHORIZED_ENDPOINT?: string;
  TEA_AUTHORIZED_TOKEN?: string;
  FACE_CHECK_API_TOKEN?: string;
  FACE_CHECK_TESTING_MODE?: string;
};

export const runtimeEnv = env as unknown as GossipEnv;

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, first_name TEXT NOT NULL, age INTEGER NOT NULL, city TEXT NOT NULL, usernames_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, access_token_hash TEXT, face_search_consent INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS source_runs (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE, source TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, started_at TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, source TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'manual_import', provider TEXT NOT NULL DEFAULT 'GossipCheck', external_id TEXT, title TEXT NOT NULL, excerpt TEXT NOT NULL, source_url TEXT, confidence INTEGER NOT NULL DEFAULT 0, provider_score INTEGER, reasons_json TEXT NOT NULL DEFAULT '[]', subject_age INTEGER, subject_location TEXT, comment_count INTEGER NOT NULL DEFAULT 0, red_flags INTEGER NOT NULL DEFAULT 0, green_flags INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL DEFAULT '{}', captured_at TEXT NOT NULL, object_key TEXT, mime_type TEXT, dismissed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence_comments (id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE, external_id TEXT, author TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, posted_at TEXT, reactions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scan_photos (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, object_key TEXT NOT NULL, mime_type TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS profiles_session_idx ON profiles(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_session_idx ON scans(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS source_runs_scan_idx ON source_runs(scan_id);
CREATE INDEX IF NOT EXISTS source_runs_queue_idx ON source_runs(source, status, scan_id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS evidence_scan_idx ON evidence(scan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_photos_session_idx ON scan_photos(session_id, created_at DESC);
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
  schemaReady ??= (async () => {
    const db = database();
    const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
    const scanColumns = (await db.prepare('PRAGMA table_info(scans)').all<{ name: string }>()).results;
    if (!scanColumns.some((column) => column.name === 'access_token_hash')) {
      await db.prepare('ALTER TABLE scans ADD COLUMN access_token_hash TEXT').run();
    }
    if (!scanColumns.some((column) => column.name === 'face_search_consent')) {
      await db.prepare('ALTER TABLE scans ADD COLUMN face_search_consent INTEGER NOT NULL DEFAULT 0').run();
    }
    const evidenceColumns = (await db.prepare('PRAGMA table_info(evidence)').all<{ name: string }>()).results;
    const additions = [
      ['kind', "TEXT NOT NULL DEFAULT 'manual_import'"],
      ['provider', "TEXT NOT NULL DEFAULT 'GossipCheck'"],
      ['external_id', 'TEXT'],
      ['provider_score', 'INTEGER'],
      ['subject_age', 'INTEGER'],
      ['subject_location', 'TEXT'],
      ['comment_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['red_flags', 'INTEGER NOT NULL DEFAULT 0'],
      ['green_flags', 'INTEGER NOT NULL DEFAULT 0'],
      ['metadata_json', "TEXT NOT NULL DEFAULT '{}'"],
    ] as const;
    for (const [name, definition] of additions) {
      if (!evidenceColumns.some((column) => column.name === name)) {
        await db.prepare(`ALTER TABLE evidence ADD COLUMN ${name} ${definition}`).run();
      }
    }
    await db.prepare("CREATE TABLE IF NOT EXISTS evidence_comments (id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE, external_id TEXT, author TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, posted_at TEXT, reactions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)").run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS scans_access_token_hash_idx ON scans(access_token_hash) WHERE access_token_hash IS NOT NULL').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS evidence_external_idx ON evidence(provider, external_id) WHERE external_id IS NOT NULL').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS evidence_comments_evidence_idx ON evidence_comments(evidence_id, posted_at)').run();
    await db.prepare("UPDATE evidence SET kind = 'web_page', provider = 'Brave Search' WHERE source = 'Public web' AND kind = 'manual_import' AND reasons_json NOT LIKE '%Imported by you%'").run();
    await db.prepare("UPDATE evidence SET kind = 'tea_post', provider = 'Legacy Tea connector' WHERE source = 'Tea' AND kind = 'manual_import' AND reasons_json NOT LIKE '%Imported by you%' AND reasons_json NOT LIKE '%Analyst reviewed%'").run();
    await db.prepare(`
      INSERT INTO source_runs (id, scan_id, source, status, note, completed_at)
      SELECT lower(hex(randomblob(16))), s.id, 'Face search', 'complete', 'Not run for this legacy scan.', s.completed_at
      FROM scans s
      WHERE NOT EXISTS (SELECT 1 FROM source_runs sr WHERE sr.scan_id = s.id AND sr.source = 'Face search')
    `).run();
    await db.prepare(`
      UPDATE source_runs
      SET status = 'queued', note = 'Awaiting a manual Tea review. An authorized analyst must complete this source check.'
      WHERE source = 'Tea' AND status = 'unconfigured'
    `).run();
    await db.prepare(`
      DELETE FROM profiles
      WHERE id IN (
        SELECT DISTINCT s.profile_id
        FROM scans s
        JOIN evidence e ON e.scan_id = s.id
        WHERE e.reasons_json LIKE '%"Example report"%'
      )
    `).run();
    await db.prepare('PRAGMA optimize').run();
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export async function sessionIdForReportAccess(scanId: string, accessToken: string) {
  if (accessToken.length < 32) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  const tokenHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const row = await database().prepare('SELECT session_id FROM scans WHERE id = ? AND access_token_hash = ?')
    .bind(scanId, tokenHash).first<{ session_id: string }>();
  return row?.session_id || null;
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
  has_profile_photo: number;
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
  kind: EvidenceRecord['kind'];
  provider: string;
  external_id: string | null;
  title: string;
  excerpt: string;
  source_url: string | null;
  confidence: number;
  reasons_json: string;
  captured_at: string;
  object_key: string | null;
  dismissed: number;
  provider_score: number | null;
  subject_age: number | null;
  subject_location: string | null;
  comment_count: number;
  red_flags: number;
  green_flags: number;
};

type CommentRow = {
  id: string;
  evidence_id: string;
  author: string;
  text: string;
  posted_at: string | null;
  reactions: number;
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
    SELECT id, scan_id, source, kind, provider, external_id, title, excerpt, source_url, confidence, provider_score,
      reasons_json, subject_age, subject_location, comment_count, red_flags, green_flags, captured_at, object_key, dismissed
    FROM evidence WHERE session_id = ? AND scan_id IN (${placeholders}) ORDER BY created_at DESC
  `).bind(sessionId, ...scanIds);
  return (await statement.all<EvidenceRow>()).results;
}

async function commentRows(evidenceIds: string[]) {
  if (!evidenceIds.length) return [];
  const placeholders = evidenceIds.map(() => '?').join(',');
  return (await database().prepare(`
    SELECT id, evidence_id, author, text, posted_at, reactions
    FROM evidence_comments WHERE evidence_id IN (${placeholders}) ORDER BY posted_at ASC, rowid ASC
  `).bind(...evidenceIds).all<CommentRow>()).results;
}

export async function hydrateScans(rows: ScanRow[], sessionId: string): Promise<ScanRecord[]> {
  const ids = rows.map((row) => row.id);
  const [sources, evidence] = await Promise.all([sourceRows(ids, sessionId), evidenceRows(ids, sessionId)]);
  const comments = await commentRows(evidence.map((item) => item.id));

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
      photoUrl: row.has_profile_photo ? `/api/scans/${row.id}/photo` : null,
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
      kind: item.kind,
      provider: item.provider,
      externalId: item.external_id,
      title: item.title,
      excerpt: item.excerpt,
      sourceUrl: item.source_url,
      confidence: item.confidence,
      reasons: parseJsonArray(item.reasons_json),
      capturedAt: item.captured_at,
      hasImage: Boolean(item.object_key),
      imageUrl: item.object_key ? `/api/evidence/${item.id}/asset` : null,
      dismissed: Boolean(item.dismissed),
      subjectAge: item.subject_age,
      subjectLocation: item.subject_location,
      commentCount: item.comment_count,
      redFlags: item.red_flags,
      greenFlags: item.green_flags,
      providerScore: item.provider_score,
      comments: comments.filter((comment) => comment.evidence_id === item.id).map((comment) => ({
        id: comment.id,
        author: comment.author,
        text: comment.text,
        postedAt: comment.posted_at,
        reactions: comment.reactions,
      })),
    })),
  }));
}

export async function getScans(sessionId: string, scanId?: string) {
  await ensureSchema();
  const query = `
    SELECT s.id, s.status, s.created_at, s.completed_at, s.error,
      p.first_name, p.age, p.city, p.usernames_json,
      EXISTS(SELECT 1 FROM scan_photos sp WHERE sp.scan_id = s.id AND sp.session_id = s.session_id) AS has_profile_photo
    FROM scans s JOIN profiles p ON p.id = s.profile_id
    WHERE s.session_id = ? ${scanId ? 'AND s.id = ?' : ''}
    ORDER BY s.created_at DESC LIMIT ${scanId ? 1 : 12}
  `;
  const statement = database().prepare(query).bind(...(scanId ? [sessionId, scanId] : [sessionId]));
  const rows = (await statement.all<ScanRow>()).results;
  return hydrateScans(rows, sessionId);
}
