import { NextResponse } from 'next/server';
import { database, ensureSchema, evidenceBucket } from '../../../../../lib/database';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

type AssetRow = { object_key: string; mime_type: string | null };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id } = await context.params;
    await ensureSchema();
    const row = await database().prepare('SELECT object_key, mime_type FROM evidence WHERE id = ? AND session_id = ? AND object_key IS NOT NULL')
      .bind(id, session.id).first<AssetRow>();
    if (!row) return session.attach(NextResponse.json({ error: 'Image not found.' }, { status: 404 }));
    const object = await evidenceBucket().get(row.object_key);
    if (!object) return session.attach(NextResponse.json({ error: 'Image not found.' }, { status: 404 }));
    const headers = new Headers({
      'Content-Type': row.mime_type || object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    return session.attach(new Response(object.body, { headers }));
  } catch (error) {
    console.error('Could not load evidence image', error);
    return NextResponse.json({ error: 'Image could not be loaded.' }, { status: 500 });
  }
}
