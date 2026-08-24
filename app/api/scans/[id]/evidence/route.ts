import { NextResponse } from 'next/server';
import { database, evidenceBucket, getScans } from '../../../../../lib/database';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
const text = (data: FormData, name: string, max: number) => String(data.get(name) || '').trim().slice(0, max);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id: scanId } = await context.params;
    const [ownedScan] = await getScans(session.id, scanId);
    if (!ownedScan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));

    const data = await request.formData();
    const title = text(data, 'title', 160);
    const excerpt = text(data, 'excerpt', 1200);
    const sourceUrl = text(data, 'sourceUrl', 1000);
    const capturedAtInput = text(data, 'capturedAt', 40);
    const fileValue = data.get('image');
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!title || !excerpt) return session.attach(NextResponse.json({ error: 'Add a title and the relevant text from the Tea evidence.' }, { status: 400 }));
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return session.attach(NextResponse.json({ error: 'The source link must be a valid http or https URL.' }, { status: 400 }));
      }
    }
    if (file && (!allowedImages.has(file.type) || file.size > 8 * 1024 * 1024)) {
      return session.attach(NextResponse.json({ error: 'Screenshots must be JPG, PNG, or WebP and no larger than 8 MB.' }, { status: 400 }));
    }

    const evidenceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const objectKey = file ? `${session.id}/${scanId}/${evidenceId}` : null;
    if (file && objectKey) {
      await evidenceBucket().put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name.slice(0, 180), evidenceId },
      });
    }

    try {
      await database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, title, excerpt, source_url, confidence, reasons_json, captured_at, object_key, mime_type, created_at)
        VALUES (?, ?, ?, 'Tea', ?, ?, ?, 100, ?, ?, ?, ?, ?)
      `).bind(evidenceId, scanId, session.id, title, excerpt, sourceUrl || null, JSON.stringify(['Imported by you', file ? 'Screenshot attached' : 'Source details supplied']), capturedAtInput || now, objectKey, file?.type || null, now).run();
    } catch (error) {
      if (objectKey) await evidenceBucket().delete(objectKey);
      throw error;
    }

    const [scan] = await getScans(session.id, scanId);
    return session.attach(NextResponse.json({ scan }, { status: 201 }));
  } catch (error) {
    console.error('Could not save evidence', error);
    return NextResponse.json({ error: 'The Tea evidence could not be saved.' }, { status: 500 });
  }
}
