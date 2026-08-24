import { NextResponse } from 'next/server';
import { database, ensureSchema, getScans } from '../../../../lib/database';
import { sessionFor } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const session = await sessionFor(request);
    const existing = await getScans(session.id);
    if (existing[0]) return session.attach(NextResponse.json({ scan: existing[0] }));

    const now = new Date().toISOString();
    const profileId = crypto.randomUUID();
    const scanId = crypto.randomUUID();
    const capturedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    await database().batch([
      database().prepare(`
        INSERT INTO profiles (id, session_id, first_name, age, city, usernames_json, created_at, updated_at)
        VALUES (?, ?, 'Alex', 29, 'Austin, Texas', '["alex.demo"]', ?, ?)
      `).bind(profileId, session.id, now, now),
      database().prepare(`
        INSERT INTO scans (id, session_id, profile_id, status, created_at, started_at, completed_at)
        VALUES (?, ?, ?, 'complete', ?, ?, ?)
      `).bind(scanId, session.id, profileId, now, now, now),
      database().prepare(`
        INSERT INTO source_runs (id, scan_id, source, status, note, started_at, completed_at)
        VALUES (?, ?, 'Tea', 'complete', 'Example data only — configure an authorized Tea provider for a real search.', ?, ?)
      `).bind(crypto.randomUUID(), scanId, now, now),
      database().prepare(`
        INSERT INTO source_runs (id, scan_id, source, status, note, started_at, completed_at)
        VALUES (?, ?, 'Public web', 'complete', 'Example data only — configure public web search for a real search.', ?, ?)
      `).bind(crypto.randomUUID(), scanId, now, now),
      database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, title, excerpt, confidence, reasons_json, captured_at, created_at)
        VALUES (?, ?, ?, 'Tea', 'Example Tea post with matching profile details', 'Illustrative preview: a post mentions the same first name, age range, and city. Review the original source before deciding whether a real result refers to you.', 91, ?, ?, ?)
      `).bind(crypto.randomUUID(), scanId, session.id, JSON.stringify(['Example report', 'First name matched', 'City matched']), capturedAt, now),
      database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, title, excerpt, confidence, reasons_json, captured_at, created_at)
        VALUES (?, ?, ?, 'Tea', 'Example comment thread', 'Illustrative preview: comments provide additional context around a possible match. GossipCheck keeps the source and confidence signals together for review.', 74, ?, ?, ?)
      `).bind(crypto.randomUUID(), scanId, session.id, JSON.stringify(['Example report', 'Age range matched']), capturedAt, now),
      database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, title, excerpt, confidence, reasons_json, captured_at, created_at)
        VALUES (?, ?, ?, 'Public web', 'Example public profile mention', 'Illustrative preview: a public page contains a matching username and location. This is a candidate to verify, not proof of identity.', 83, ?, ?, ?)
      `).bind(crypto.randomUUID(), scanId, session.id, JSON.stringify(['Example report', 'Username matched', 'City matched']), capturedAt, now),
    ]);

    const [scan] = await getScans(session.id, scanId);
    return session.attach(NextResponse.json({ scan }, { status: 201 }));
  } catch (error) {
    console.error('Could not create example report', error);
    return NextResponse.json({ error: 'The example report could not be created.' }, { status: 500 });
  }
}
