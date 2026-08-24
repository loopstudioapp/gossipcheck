UPDATE source_runs
SET status = 'queued',
    note = 'Awaiting a manual Tea review. An authorized analyst must complete this source check.'
WHERE source = 'Tea'
  AND status = 'unconfigured';

CREATE INDEX IF NOT EXISTS source_runs_queue_idx
ON source_runs(source, status, scan_id)
WHERE status = 'queued';
