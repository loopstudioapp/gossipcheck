import { NextResponse } from 'next/server';
import { getScans, redactScan, sessionIdForReportAccess } from '../../../../lib/database';
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
