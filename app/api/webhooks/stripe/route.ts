import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { claimStripeEvent, expireEntitlementForSubscription, grantScanEntitlement, releaseStripeEvent } from '../../../../lib/database';
import { resolveCheckoutPlan, stripe, webhookConfigured } from '../../../../lib/stripe';

export const dynamic = 'force-dynamic';

function scanIdFromEvent(event: Stripe.Event): string | null {
  if (event.type.startsWith('checkout.session')) {
    const session = event.data.object as Stripe.Checkout.Session;
    return session.client_reference_id || session.metadata?.scan_id || null;
  }
  if (event.type.startsWith('customer.subscription')) {
    const subscription = event.data.object as Stripe.Subscription;
    return subscription.metadata?.scan_id || null;
  }
  return null;
}

export async function POST(request: Request) {
  const client = stripe();
  if (!webhookConfigured() || !client) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    // Raw body is required for signature verification.
    event = await client.webhooks.constructEventAsync(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    console.error('Rejected Stripe webhook', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const scanId = scanIdFromEvent(event);
  // Claim the event exactly once so retries and redeliveries stay idempotent.
  if (!(await claimStripeEvent(event.id, event.type, scanId))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (!scanId || session.status !== 'complete') break;
        const plan = await resolveCheckoutPlan(session);
        await grantScanEntitlement(scanId, {
          plan,
          customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
          subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        await expireEntitlementForSubscription(event.data.object.id);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error(`Could not process Stripe event ${event.id} (${event.type})`, error);
    // Undo the claim so Stripe's automatic retry is handled as fresh.
    await releaseStripeEvent(event.id).catch(() => undefined);
    return NextResponse.json({ error: 'Event could not be processed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
