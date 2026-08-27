'use client';

import { useCallback, useMemo } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

type EmbeddedPaymentProps = {
  scanId: string;
  accessToken: string;
  email: string;
  onError: (message: string) => void;
};

export default function EmbeddedPayment({ scanId, accessToken, email, onError }: EmbeddedPaymentProps) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripePromise = useMemo(() => publishableKey ? loadStripe(publishableKey) : null, [publishableKey]);
  const fetchClientSecret = useCallback(async () => {
    const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
    const response = await fetch(`/api/scans/${scanId}/checkout${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'monthly', email }),
    });
    const data = await response.json() as { clientSecret?: string; error?: string };
    if (!response.ok || !data.clientSecret) {
      const message = data.error || 'Checkout could not be started.';
      onError(message);
      throw new Error(message);
    }
    return data.clientSecret;
  }, [accessToken, email, onError, scanId]);

  if (!stripePromise) return <p className="pw-error" role="alert">Stripe is not configured for this deployment yet.</p>;

  return (
    <div className="pw-stripe-embed">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
