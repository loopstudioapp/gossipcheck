ALTER TABLE scans ADD COLUMN face_search_consent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE evidence ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual_import';
ALTER TABLE evidence ADD COLUMN provider TEXT NOT NULL DEFAULT 'GossipCheck';
ALTER TABLE evidence ADD COLUMN external_id TEXT;
ALTER TABLE evidence ADD COLUMN provider_score INTEGER;
ALTER TABLE evidence ADD COLUMN subject_age INTEGER;
ALTER TABLE evidence ADD COLUMN subject_location TEXT;
ALTER TABLE evidence ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN red_flags INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN green_flags INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS evidence_comments (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  external_id TEXT,
  author TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  posted_at TEXT,
  reactions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS evidence_external_idx
ON evidence(provider, external_id)
WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS evidence_comments_evidence_idx
ON evidence_comments(evidence_id, posted_at);

UPDATE evidence
SET kind = 'web_page', provider = 'Brave Search'
WHERE source = 'Public web'
  AND kind = 'manual_import'
  AND reasons_json NOT LIKE '%Imported by you%';

UPDATE evidence
SET kind = 'tea_post', provider = 'Legacy Tea connector'
WHERE source = 'Tea'
  AND kind = 'manual_import'
  AND reasons_json NOT LIKE '%Imported by you%'
  AND reasons_json NOT LIKE '%Analyst reviewed%';

INSERT INTO source_runs (id, scan_id, source, status, note, completed_at)
SELECT lower(hex(randomblob(16))), s.id, 'Face search', 'complete', 'Not run for this legacy scan.', s.completed_at
FROM scans s
WHERE NOT EXISTS (
  SELECT 1 FROM source_runs sr
  WHERE sr.scan_id = s.id AND sr.source = 'Face search'
);

PRAGMA optimize;
