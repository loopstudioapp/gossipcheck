import { NextResponse } from 'next/server';
import { database, ensureSchema } from '../../../../lib/database';
import { sessionFor } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id } = await context.params;
    const body = await request.json() as { dismissed?: unknown };
    if (typeof body.dismissed !== 'boolean') return session.attach(NextResponse.json({ error: 'Invalid evidence state.' }, { status: 400 }));
    await ensureSchema();
    const result = await database().prepare('UPDATE evidence SET dismissed = ? WHERE id = ? AND session_id = ?')
      .bind(body.dismissed ? 1 : 0, id, session.id).run();
    if (!result.meta.changes) return session.attach(NextResponse.json({ error: 'Evidence not found.' }, { status: 404 }));
    return session.attach(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error('Could not update evidence', error);
    return NextResponse.json({ error: 'Evidence could not be updated.' }, { status: 500 });
  }
}
