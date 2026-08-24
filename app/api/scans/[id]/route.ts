import { NextResponse } from 'next/server';
import { getScans } from '../../../../lib/database';
import { sessionFor } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id } = await context.params;
    const [scan] = await getScans(session.id, id);
    if (!scan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));
    return session.attach(NextResponse.json({ scan }));
  } catch (error) {
    console.error('Could not load scan', error);
    return NextResponse.json({ error: 'The scan could not be loaded.' }, { status: 500 });
  }
}
