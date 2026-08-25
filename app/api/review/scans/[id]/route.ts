import { NextResponse } from 'next/server';
import { database, ensureSchema, evidenceBucket, getScans, type PostgresStatement } from '../../../../../lib/database';
import { configuredReviewToken, reviewerAuthorized } from '../../../../../lib/review-auth';

export const dynamic = 'force-dynamic';

const clean = (value: FormDataEntryValue | null, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!configuredReviewToken()) return NextResponse.json({ error: 'Analyst review is not configured.' }, { status: 503 });
  if (!await reviewerAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  let objectKey: string | null = null;
  try {
    await ensureSchema();
    const { id: scanId } = await context.params;
    const owner = await database().prepare('SELECT session_id FROM scans WHERE id = ?').bind(scanId).first<{ session_id: string }>();
    if (!owner) return NextResponse.json({ error: 'Scan not found.' }, { status: 404 });

    const form = await request.formData();
    const outcome = clean(form.get('outcome'), 20);
    const title = clean(form.get('title'), 160);
    const excerpt = clean(form.get('excerpt'), 1200);
    const sourceUrl = clean(form.get('sourceUrl'), 1000);
    const capturedAt = clean(form.get('capturedAt'), 40) || new Date().toISOString();
    const fileValue = form.get('image');
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!['found', 'uncertain', 'not_found'].includes(outcome)) return NextResponse.json({ error: 'Choose found, uncertain, or not found.' }, { status: 400 });
    if (outcome !== 'not_found' && (!title || !excerpt)) return NextResponse.json({ error: 'A found or uncertain review needs a title and evidence summary.' }, { status: 400 });
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        return NextResponse.json({ error: 'The source link must be a valid http or https URL.' }, { status: 400 });
      }
    }
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Screenshots must be JPG, PNG, or WebP and no larger than 8 MB.' }, { status: 400 });
    }

    const evidenceId = crypto.randomUUID();
    const now = new Date().toISOString();
    if (file) {
      objectKey = `${owner.session_id}/${scanId}/analyst-${evidenceId}`;
      await evidenceBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    }

    const note = outcome === 'found'
      ? 'Analyst review completed: potential Tea evidence was found.'
      : outcome === 'uncertain'
        ? 'Analyst review completed: possible Tea evidence needs customer verification.'
        : 'Analyst review completed: no matching Tea evidence was found.';
    const writes: PostgresStatement[] = [
      database().prepare(`UPDATE source_runs SET status = 'complete', note = ?, completed_at = ? WHERE scan_id = ? AND source = 'Tea'`).bind(note, now, scanId),
    ];
    if (outcome !== 'not_found') {
      writes.push(database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, kind, provider, title, excerpt, source_url, confidence, reasons_json, captured_at, object_key, mime_type, created_at)
        VALUES (?, ?, ?, 'Tea', 'manual_import', 'Authorized analyst', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(evidenceId, scanId, owner.session_id, title, excerpt, sourceUrl || null, outcome === 'found' ? 80 : 55, JSON.stringify(['Analyst reviewed', outcome === 'found' ? 'Potential identity match' : 'Needs customer verification', 'Post claims remain unverified user content']), capturedAt, objectKey, file?.type || null, now));
    }
    await database().batch(writes);

    const [scan] = await getScans(owner.session_id, scanId);
    return NextResponse.json({ scan });
  } catch (error) {
    if (objectKey) await evidenceBucket().delete(objectKey).catch(() => undefined);
    console.error('Could not complete analyst review', error);
    return NextResponse.json({ error: 'The review could not be saved.' }, { status: 500 });
  }
}
