import { NextResponse } from 'next/server';
import { database, ensureSchema, evidenceBucket } from '../../../../../../lib/database';
import { configuredReviewToken, reviewerAuthorized } from '../../../../../../lib/review-auth';

export const dynamic = 'force-dynamic';

type PhotoRow = { object_key: string; mime_type: string };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!configuredReviewToken()) return NextResponse.json({ error: 'Analyst review is not configured.' }, { status: 503 });
  if (!await reviewerAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    await ensureSchema();
    const { id } = await context.params;
    const row = await database().prepare('SELECT object_key, mime_type FROM scan_photos WHERE scan_id = ?').bind(id).first<PhotoRow>();
    if (!row) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
    const object = await evidenceBucket().get(row.object_key);
    if (!object) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
    return new Response(object.body, { headers: { 'Content-Type': row.mime_type, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Could not load analyst photo', error);
    return NextResponse.json({ error: 'The photo could not be loaded.' }, { status: 500 });
  }
}
