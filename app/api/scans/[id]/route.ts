import { NextResponse } from 'next/server';
import { database, ensureSchema, getScans, redactScan, sessionIdForReportAccess } from '../../../../lib/database';
import { sessionFor } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id } = await context.params;
    let [scan] = await getScans(session.id, id);
    if (!scan) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(id, accessToken);
      if (accessSessionId) [scan] = await getScans(accessSessionId, id);
    }
    if (!scan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));
    // Evidence content stays server-side until the report is paid for.
    return session.attach(NextResponse.json({ scan: redactScan(scan) }));
  } catch (error) {
    console.error('Could not load scan', error);
    return NextResponse.json({ error: 'The scan could not be loaded.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(request);
  try {
    const { id } = await context.params;
    let effectiveSessionId = session.id;
    let [scan] = await getScans(effectiveSessionId, id);
    if (!scan) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(id, accessToken);
      if (accessSessionId) {
        effectiveSessionId = accessSessionId;
        [scan] = await getScans(effectiveSessionId, id);
      }
    }
    if (!scan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));

    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return session.attach(NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 }));
    }

    await ensureSchema();
    await database().prepare('UPDATE scans SET report_email = ? WHERE id = ? AND session_id = ?')
      .bind(email, id, effectiveSessionId).run();
    return session.attach(NextResponse.json({ saved: true }));
  } catch (error) {
    console.error('Could not save report email', error);
    return session.attach(NextResponse.json({ error: 'Your email could not be saved. Please try again.' }, { status: 500 }));
  }
}
