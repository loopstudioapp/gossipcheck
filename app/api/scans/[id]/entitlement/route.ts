import { NextResponse } from 'next/server';
import type { PlanKey } from '../../../../../lib/backend-types';
import { entitlementIsActive, getScans, grantScanEntitlement, sessionIdForReportAccess } from '../../../../../lib/database';
import { checkoutConfigured, resolveCheckoutPlan, stripe } from '../../../../../lib/stripe';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

/**
 * Poll endpoint for the post-checkout redirect. The webhook is the primary grant
 * path; while it is in flight, a `session_id` from the success redirect is verified
 * against Stripe directly so the customer does not wait on the webhook.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await sessionFor(request);
    const { id: scanId } = await context.params;
    let [scan] = await getScans(session.id, scanId);
    if (!scan) {
      const accessToken = new URL(request.url).searchParams.get('access_token') || '';
      const accessSessionId = await sessionIdForReportAccess(scanId, accessToken);
      if (accessSessionId) [scan] = await getScans(accessSessionId, scanId);
    }
    if (!scan) return session.attach(NextResponse.json({ error: 'Scan not found.' }, { status: 404 }));

    if (entitlementIsActive(scan)) {
      return session.attach(NextResponse.json({ unlocked: true, plan: scan.entitlement.plan }));
    }

    const checkoutSessionId = new URL(request.url).searchParams.get('session_id') || '';
    if (checkoutConfigured() && checkoutSessionId && checkoutSessionId.startsWith('cs_')) {
      try {
        const checkout = await stripe()!.checkout.sessions.retrieve(checkoutSessionId);
        const matchesScan = checkout.client_reference_id === scanId || checkout.metadata?.scan_id === scanId;
        if (matchesScan && checkout.status === 'complete' && checkout.payment_status !== 'unpaid') {
          const plan: PlanKey = await resolveCheckoutPlan(checkout);
          await grantScanEntitlement(scanId, {
            plan,
            customerId: typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id ?? null,
            subscriptionId: typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription?.id ?? null,
          });
          return session.attach(NextResponse.json({ unlocked: true, plan }));
        }
      } catch (error) {
        console.error('Could not verify checkout session', error);
      }
    }

    return session.attach(NextResponse.json({ unlocked: false, status: scan.entitlement.status }));
  } catch (error) {
    console.error('Could not load entitlement', error);
    return NextResponse.json({ error: 'The report state could not be loaded.' }, { status: 500 });
  }
}
