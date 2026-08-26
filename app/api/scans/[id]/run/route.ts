import { NextResponse } from 'next/server';
import type { CreateScanRequest } from '../../../../../lib/backend-types';
import { database, ensureSchema, evidenceBucket, getScans, redactScan } from '../../../../../lib/database';
import { runProviders } from '../../../../../lib/providers';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

type RunRow = {
  session_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  face_search_consent: number;
  first_name: string;
  age: number;
  city: string;
  usernames_json: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(request);
  try {
    await ensureSchema();
    const { id: scanId } = await context.params;
    const row = await database().prepare(`
      SELECT s.session_id, s.status, s.face_search_consent, p.first_name, p.age, p.city, p.usernames_json
      FROM scans s JOIN profiles p ON p.id = s.profile_id
      WHERE s.id = ? AND s.session_id = ?
    `).bind(scanId, session.id).first<RunRow>();
    if (!row) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));
    if (row.status === 'complete') {
      const [scan] = await getScans(session.id, scanId);
      return session.attach(NextResponse.json({ scan: scan && redactScan(scan), cached: true }));
    }
    if (row.status === 'running') return session.attach(NextResponse.json({ error: 'This scan is already running.' }, { status: 409 }));

    const claimed = await database().prepare(`
      UPDATE scans SET status = 'running', error = NULL, started_at = ?, completed_at = NULL
      WHERE id = ? AND session_id = ? AND status IN ('queued', 'failed')
    `).bind(new Date().toISOString(), scanId, session.id).run();
    if (!claimed.meta.changes) return session.attach(NextResponse.json({ error: 'This scan could not be started.' }, { status: 409 }));

    if (row.status === 'failed') {
      const generatedObjects = (await database().prepare("SELECT object_key FROM evidence WHERE scan_id = ? AND kind != 'manual_import' AND object_key IS NOT NULL")
        .bind(scanId).all<{ object_key: string }>()).results;
      await database().prepare("DELETE FROM evidence WHERE scan_id = ? AND kind != 'manual_import'").bind(scanId).run();
      await Promise.all(generatedObjects.map((item) => evidenceBucket().delete(item.object_key).catch(() => undefined)));
    }

    let usernames: string[] = [];
    try {
      const parsed = JSON.parse(row.usernames_json);
      if (Array.isArray(parsed)) usernames = parsed.filter((item): item is string => typeof item === 'string');
    } catch { /* invalid legacy data becomes an empty list */ }
    const profile: CreateScanRequest = {
      firstName: row.first_name,
      age: row.age,
      city: row.city,
      usernames,
      selfSearchConfirmed: true,
      faceSearchConfirmed: Boolean(row.face_search_consent),
    };

    try {
      await runProviders(scanId, session.id, profile);
      await database().prepare(`UPDATE scans SET status = 'complete', completed_at = ? WHERE id = ? AND session_id = ?`)
        .bind(new Date().toISOString(), scanId, session.id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'Scan failed.';
      await database().prepare(`UPDATE scans SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND session_id = ?`)
        .bind(message, new Date().toISOString(), scanId, session.id).run();
    }
    const [scan] = await getScans(session.id, scanId);
    // The run response reaches the client before payment; withhold evidence content.
    return session.attach(NextResponse.json({ scan: scan && redactScan(scan) }));
  } catch (error) {
    console.error('Could not run scan', error);
    return session.attach(NextResponse.json({ error: 'The scan could not be run.' }, { status: 500 }));
  }
}
