import { NextResponse } from 'next/server';
import type { CreateScanRequest } from '../../../../../lib/backend-types';
import { getScans, sessionIdForReportAccess } from '../../../../../lib/database';
import { refreshPostDiscovery } from '../../../../../lib/providers';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(request);
  try {
    const { id: scanId } = await context.params;
    let effectiveSessionId = session.id;
    let [scan] = await getScans(effectiveSessionId, scanId);
    if (!scan) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(scanId, accessToken);
      if (accessSessionId) {
        effectiveSessionId = accessSessionId;
        [scan] = await getScans(effectiveSessionId, scanId);
      }
    }
    if (!scan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));

    const profile: CreateScanRequest = {
      firstName: scan.profile.firstName,
      age: scan.profile.age,
      city: scan.profile.city,
      usernames: scan.profile.usernames,
      selfSearchConfirmed: true,
      faceSearchConfirmed: false,
    };
    const result = await refreshPostDiscovery(scanId, effectiveSessionId, profile);
    if (result.status === 'unconfigured') return session.attach(NextResponse.json({ error: result.note }, { status: 503 }));
    if (result.status === 'failed') return session.attach(NextResponse.json({ error: result.note }, { status: 502 }));

    const [updatedScan] = await getScans(effectiveSessionId, scanId);
    return session.attach(NextResponse.json({ scan: updatedScan }));
  } catch (error) {
    console.error('Could not refresh public posts', error);
    return session.attach(NextResponse.json({ error: 'Public post discovery could not be completed.' }, { status: 500 }));
  }
}
