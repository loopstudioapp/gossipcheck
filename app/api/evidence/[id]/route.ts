import { NextResponse } from 'next/server';
import { database, ensureSchema, scanIsEntitled, sessionIdForReportAccess } from '../../../../lib/database';
import { sessionFor } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id } = await context.params;
    const body = await request.json() as { dismissed?: unknown };
    if (typeof body.dismissed !== 'boolean') return session.attach(NextResponse.json({ error: 'Invalid evidence state.' }, { status: 400 }));
    await ensureSchema();
    const evidence = await database().prepare('SELECT scan_id, session_id FROM evidence WHERE id = ?').bind(id).first<{ scan_id: string; session_id: string }>();
    if (!evidence) return session.attach(NextResponse.json({ error: 'Evidence not found.' }, { status: 404 }));
    if (evidence.session_id !== session.id) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(evidence.scan_id, accessToken);
      if (accessSessionId !== evidence.session_id) return session.attach(NextResponse.json({ error: 'Evidence not found.' }, { status: 404 }));
    }
    // Dismiss/restore is a paid-report feature.
    if (!(await scanIsEntitled(evidence.scan_id))) return session.attach(NextResponse.json({ error: 'Unlock the full report before changing evidence.' }, { status: 403 }));
    const result = await database().prepare('UPDATE evidence SET dismissed = ? WHERE id = ? AND session_id = ?')
      .bind(body.dismissed ? 1 : 0, id, evidence.session_id).run();
    if (!result.meta.changes) return session.attach(NextResponse.json({ error: 'Evidence not found.' }, { status: 404 }));
    return session.attach(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error('Could not update evidence', error);
    return NextResponse.json({ error: 'Evidence could not be updated.' }, { status: 500 });
  }
}
