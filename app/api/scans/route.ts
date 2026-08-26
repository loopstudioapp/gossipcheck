import { NextResponse } from 'next/server';
import type { CreateScanRequest } from '../../../lib/backend-types';
import { database, ensureSchema, getScans, redactScan } from '../../../lib/database';
import { sessionFor } from '../../../lib/session';

export const dynamic = 'force-dynamic';

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const scans = (await getScans(session.id)).map(redactScan);
    return session.attach(NextResponse.json({ scans }));
  } catch (error) {
    console.error('Could not list scans', error);
    return NextResponse.json({ error: 'The scan database is unavailable.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Partial<CreateScanRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const firstName = clean(body.firstName, 80);
  const city = clean(body.city, 120);
  const age = Number(body.age);
  const usernames = Array.isArray(body.usernames)
    ? body.usernames.map((value) => clean(value, 80)).filter(Boolean).slice(0, 6)
    : [];

  if (!firstName || !city || !Number.isInteger(age) || age < 18 || age > 99) {
    return NextResponse.json({ error: 'Enter a valid name, city, and age between 18 and 99.' }, { status: 400 });
  }
  if (body.selfSearchConfirmed !== true) {
    return NextResponse.json({ error: 'GossipCheck is limited to searches about yourself.' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const session = await sessionFor(request);
    const now = new Date().toISOString();
    const profileId = crypto.randomUUID();
    const scanId = crypto.randomUUID();
    const accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const tokenDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
    const accessTokenHash = [...new Uint8Array(tokenDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const faceSearchConfirmed = body.faceSearchConfirmed === true;

    await database().batch([
      database().prepare(`INSERT INTO profiles (id, session_id, first_name, age, city, usernames_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(profileId, session.id, firstName, age, city, JSON.stringify(usernames), now, now),
      database().prepare(`INSERT INTO scans (id, session_id, profile_id, access_token_hash, face_search_consent, status, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?)`)
        .bind(scanId, session.id, profileId, accessTokenHash, faceSearchConfirmed ? 1 : 0, now),
      database().prepare(`INSERT INTO source_runs (id, scan_id, source, status, note) VALUES (?, ?, 'Tea', 'queued', 'Waiting for Tea provider.')`)
        .bind(crypto.randomUUID(), scanId),
      database().prepare(`INSERT INTO source_runs (id, scan_id, source, status, note) VALUES (?, ?, 'Public web', 'queued', 'Waiting for public web provider.')`)
        .bind(crypto.randomUUID(), scanId),
      database().prepare(`INSERT INTO source_runs (id, scan_id, source, status, note) VALUES (?, ?, 'Face search', 'queued', 'Waiting for an optional reference photo.')`)
        .bind(crypto.randomUUID(), scanId),
    ]);

    const [scan] = await getScans(session.id, scanId);
    return session.attach(NextResponse.json({ scan, accessToken }, { status: 201 }));
  } catch (error) {
    console.error('Could not create scan', error);
    return NextResponse.json({ error: 'The scan could not be created.' }, { status: 500 });
  }
}
