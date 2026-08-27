import Stripe from 'stripe';
import type { PlanKey } from './backend-types';
import { runtimeEnv } from './database';

let stripeClient: Stripe | null | undefined;

/** Lazily constructed server SDK; null while STRIPE_SECRET_KEY is unset. */
export function stripe(): Stripe | null {
  if (!runtimeEnv.STRIPE_SECRET_KEY) return null;
  stripeClient ??= new Stripe(runtimeEnv.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function checkoutConfigured() {
  return Boolean(runtimeEnv.STRIPE_SECRET_KEY && runtimeEnv.STRIPE_PRICE_MONTHLY && runtimeEnv.STRIPE_INTRO_COUPON_ID);
}

export function webhookConfigured() {
  return Boolean(stripe() && runtimeEnv.STRIPE_WEBHOOK_SECRET);
}

export function priceIdForPlan(plan: PlanKey) {
  return plan === 'weekly' ? runtimeEnv.STRIPE_PRICE_WEEKLY : runtimeEnv.STRIPE_PRICE_MONTHLY;
}

function planForPrice(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === runtimeEnv.STRIPE_PRICE_WEEKLY) return 'weekly';
  if (priceId === runtimeEnv.STRIPE_PRICE_MONTHLY) return 'monthly';
  return null;
}

export function normalizePlan(value: unknown): PlanKey | null {
  return value === 'weekly' || value === 'monthly' ? value : null;
}

/**
 * Resolve the purchased plan for a checkout session: trust session metadata first,
 * then fall back to matching the subscription's price id against configured prices.
 */
export async function resolveCheckoutPlan(session: Stripe.Checkout.Session): Promise<PlanKey> {
  const fromMetadata = normalizePlan(session.metadata?.plan);
  if (fromMetadata) return fromMetadata;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (subscriptionId) {
    const client = stripe();
    if (client) {
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      const fromPrice = planForPrice(subscription.items.data[0]?.price?.id);
      if (fromPrice) return fromPrice;
    }
  }
  return 'monthly';
}
