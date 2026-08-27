'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';

type EmbeddedPaymentProps = {
  scanId: string;
  accessToken: string;
  email: string;
  onError: (message: string) => void;
};

type PaymentFormProps = Pick<EmbeddedPaymentProps, 'onError'>;

function PaymentForm({ onError }: PaymentFormProps) {
  const checkoutState = useCheckoutElements();
  const [cardOpen, setCardOpen] = useState(false);
  const [expressReady, setExpressReady] = useState(false);
  const [hasExpressMethod, setHasExpressMethod] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const showError = useCallback((value: string) => {
    setMessage(value);
    onError(value);
  }, [onError]);

  const confirmExpress = useCallback(async (event: StripeExpressCheckoutElementConfirmEvent) => {
    if (checkoutState.type !== 'success') return;
    setSubmitting(true);
    setMessage('');
    const result = await checkoutState.checkout.confirm({ expressCheckoutConfirmEvent: event });
    if (result.type === 'error') {
      showError(result.error.message || 'Payment could not be completed. Please try again.');
      setSubmitting(false);
    }
  }, [checkoutState, showError]);

  const confirmCard = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkoutState.type !== 'success') return;
    setSubmitting(true);
    setMessage('');
    const result = await checkoutState.checkout.confirm();
    if (result.type === 'error') {
      showError(result.error.message || 'Payment could not be completed. Please try again.');
      setSubmitting(false);
    }
  }, [checkoutState, showError]);

  if (checkoutState.type === 'loading') {
    return <div className="pw-payment-loading" role="status">Loading secure payment options…</div>;
  }

  if (checkoutState.type === 'error') {
    return <p className="pw-error" role="alert">{checkoutState.error.message}</p>;
  }

  return (
    <div className="pw-stripe-elements">
      <div className={`pw-express-checkout${expressReady && !hasExpressMethod ? ' is-unavailable' : ''}`}>
        <ExpressCheckoutElement
          options={{
            buttonHeight: 54,
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            buttonType: { applePay: 'plain', googlePay: 'plain' },
            layout: { maxColumns: 2, maxRows: 1, overflow: 'auto' },
            paymentMethodOrder: ['apple_pay', 'link', 'google_pay'],
            paymentMethods: { applePay: 'auto', link: 'auto', googlePay: 'auto' },
          }}
          onReady={({ availablePaymentMethods }) => {
            setExpressReady(true);
            setHasExpressMethod(Boolean(availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)));
          }}
          onConfirm={confirmExpress}
          onLoadError={({ error }) => showError(error.message || 'Fast payment options could not be loaded.')}
        />
      </div>

      {hasExpressMethod && <div className="pw-divider"><span>Or pay with card</span></div>}

      <button
        className="pw-card-toggle"
        type="button"
        aria-expanded={cardOpen}
        aria-controls="stripe-card-form"
        onClick={() => setCardOpen((current) => !current)}
      >
        <span className="pw-card-icon" aria-hidden="true">▰</span>
        <b>Card</b>
        <span className={`pw-card-chevron${cardOpen ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {cardOpen && (
        <form className="pw-card-form" id="stripe-card-form" onSubmit={confirmCard}>
          <PaymentElement
            options={{
              layout: { type: 'accordion', defaultCollapsed: false, radios: 'never' },
              paymentMethodOrder: ['card'],
              wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
            }}
            onLoadError={({ error }) => showError(error.message || 'The card form could not be loaded.')}
          />
          {message && <p className="pw-error" role="alert">{message}</p>}
          <button className="pw-pay" type="submit" disabled={submitting}>
            {submitting ? 'Processing…' : 'Pay & Get Report'} <span aria-hidden="true">→</span>
          </button>
        </form>
      )}
    </div>
  );
}

export default function EmbeddedPayment({ scanId, accessToken, email, onError }: EmbeddedPaymentProps) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripePromise = useMemo(() => publishableKey ? loadStripe(publishableKey) : null, [publishableKey]);
  const clientSecret = useMemo(async () => {
    const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
    const response = await fetch(`/api/scans/${scanId}/checkout${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'monthly', email }),
    });
    const data = await response.json() as { clientSecret?: string; error?: string };
    if (!response.ok || !data.clientSecret) {
      const error = data.error || 'Checkout could not be started.';
      onError(error);
      throw new Error(error);
    }
    return data.clientSecret;
  }, [accessToken, email, onError, scanId]);

  const options = useMemo(() => ({
    clientSecret,
    elementsOptions: {
      appearance: {
        theme: 'stripe' as const,
        variables: {
          colorPrimary: '#111a20',
          colorText: '#111a20',
          colorDanger: '#9f2c2c',
          borderRadius: '12px',
          fontFamily: 'Arial, sans-serif',
        },
      },
    },
  }), [clientSecret]);

  if (!stripePromise) return <p className="pw-error" role="alert">Stripe is not configured for this deployment yet.</p>;

  return (
    <CheckoutElementsProvider stripe={stripePromise} options={options}>
      <PaymentForm onError={onError} />
    </CheckoutElementsProvider>
  );
}
