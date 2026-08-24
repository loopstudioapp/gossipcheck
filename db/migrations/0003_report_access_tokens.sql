ALTER TABLE scans ADD COLUMN access_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS scans_access_token_hash_idx
ON scans(access_token_hash)
WHERE access_token_hash IS NOT NULL;
