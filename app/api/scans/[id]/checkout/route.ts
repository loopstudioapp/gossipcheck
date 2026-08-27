import { NextResponse } from 'next/server';
import { database, ensureSchema, entitlementIsActive, getScans, sessionIdForReportAccess } from '../../../../../lib/database';
import { checkoutConfigured, normalizePlan, priceIdForPlan, stripe } from '../../../../../lib/stripe';
import { sessionFor } from '../../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(request);
  try {
    if (!checkoutConfigured()) {
      return session.attach(NextResponse.json({ error: 'Payments are not configured for this deployment yet.' }, { status: 503 }));
    }
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
    if (entitlementIsActive(scan)) return session.attach(NextResponse.json({ error: 'This report is already unlocked.', alreadyUnlocked: true }, { status: 409 }));

    const body = await request.json().catch(() => ({})) as { plan?: unknown; email?: unknown };
    let plan = normalizePlan(body.plan);
    plan ??= 'monthly';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return session.attach(NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 }));
    }
    const priceId = priceIdForPlan(plan);
    if (!priceId) return session.attach(NextResponse.json({ error: 'Payments are not configured for this deployment yet.' }, { status: 503 }));

    // Carry report access through the hosted checkout round-trip so token-link
    // users (no session cookie) can still open the unlocked report.
    const accessToken = new URL(request.url).searchParams.get('access_token') || '';
    const returnParams = new URLSearchParams({ scan_id: scanId });
    if (accessToken) returnParams.set('access_token', accessToken);
    const origin = new URL(request.url).origin;

    const checkout = await stripe()!.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: scanId,
      metadata: { scan_id: scanId, plan },
      subscription_data: { metadata: { scan_id: scanId, plan } },
      ...(email ? { customer_email: email } : {}),
      success_url: `${origin}/report?${returnParams.toString()}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/report?${returnParams.toString()}&checkout=cancelled`,
    });

    await ensureSchema();
    await database().prepare('UPDATE scans SET entitlement_plan = COALESCE(entitlement_plan, ?) WHERE id = ?').bind(plan, scanId).run();
    return session.attach(NextResponse.json({ url: checkout.url, plan }, { status: 201 }));
  } catch (error) {
    console.error('Could not start checkout', error);
    return session.attach(NextResponse.json({ error: 'Checkout could not be started. Please try again.' }, { status: 500 }));
  }
}
