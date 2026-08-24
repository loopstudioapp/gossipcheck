import { NextResponse } from 'next/server';
import { database, evidenceBucket, getScans, sessionIdForReportAccess } from '../../../../../lib/database';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
type PhotoRow = { session_id: string; object_key: string; mime_type: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id: scanId } = await context.params;
    const [ownedScan] = await getScans(session.id, scanId);
    if (!ownedScan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));
    const data = await request.formData();
    const value = data.get('photo');
    if (!(value instanceof File) || !allowedImages.has(value.type) || value.size === 0 || value.size > 8 * 1024 * 1024) {
      return session.attach(NextResponse.json({ error: 'Choose a JPG, PNG, or WebP photo no larger than 8 MB.' }, { status: 400 }));
    }

    const previous = await database().prepare('SELECT object_key FROM scan_photos WHERE scan_id = ? AND session_id = ?')
      .bind(scanId, session.id).first<{ object_key: string }>();
    const objectKey = `${session.id}/${scanId}/profile-${crypto.randomUUID()}`;
    await evidenceBucket().put(objectKey, await value.arrayBuffer(), {
      httpMetadata: { contentType: value.type },
      customMetadata: { purpose: 'profile-match', originalName: value.name.slice(0, 180) },
    });

    try {
      const now = new Date().toISOString();
      await database().prepare(`
        INSERT INTO scan_photos (id, scan_id, session_id, object_key, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id) DO UPDATE SET object_key = excluded.object_key, mime_type = excluded.mime_type, created_at = excluded.created_at
      `).bind(crypto.randomUUID(), scanId, session.id, objectKey, value.type, now).run();
      if (previous?.object_key) await evidenceBucket().delete(previous.object_key);
    } catch (error) {
      await evidenceBucket().delete(objectKey);
      throw error;
    }

    const [scan] = await getScans(session.id, scanId);
    return session.attach(NextResponse.json({ scan }, { status: 201 }));
  } catch (error) {
    console.error('Could not save profile photo', error);
    return NextResponse.json({ error: 'The profile photo could not be saved.' }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id: scanId } = await context.params;
    const row = await database().prepare('SELECT session_id, object_key, mime_type FROM scan_photos WHERE scan_id = ?')
      .bind(scanId).first<PhotoRow>();
    if (!row) return session.attach(NextResponse.json({ error: 'Photo not found.' }, { status: 404 }));
    if (row.session_id !== session.id) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(scanId, accessToken);
      if (accessSessionId !== row.session_id) return session.attach(NextResponse.json({ error: 'Photo not found.' }, { status: 404 }));
    }
    const object = await evidenceBucket().get(row.object_key);
    if (!object) return session.attach(NextResponse.json({ error: 'Photo not found.' }, { status: 404 }));
    return session.attach(new Response(object.body, { headers: {
      'Content-Type': row.mime_type,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    } }));
  } catch (error) {
    console.error('Could not load profile photo', error);
    return NextResponse.json({ error: 'The profile photo could not be loaded.' }, { status: 500 });
  }
}
