export const META_PIXEL_ID = '2135312044071642';

type MetaEventParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

let matchedEmail = '';

const normalizedEmail = (email: string) => email.trim().toLowerCase();
const emailStorageKey = (scanId: string) => `gossipcheck-meta-email:${scanId}`;

export function rememberMetaEmail(scanId: string, email: string) {
  try {
    window.sessionStorage.setItem(emailStorageKey(scanId), normalizedEmail(email));
  } catch {
    // Tracking storage must never interrupt the funnel.
  }
}

export function storedMetaEmail(scanId: string) {
  try {
    return window.sessionStorage.getItem(emailStorageKey(scanId)) || '';
  } catch {
    return '';
  }
}

export function clearMetaEmail(scanId: string) {
  try {
    window.sessionStorage.removeItem(emailStorageKey(scanId));
  } catch {
    // Tracking storage must never interrupt the funnel.
  }
}

function applyAdvancedMatching(email: string) {
  const normalized = normalizedEmail(email);
  if (!normalized || matchedEmail === normalized || !window.fbq) return;
  window.fbq('init', META_PIXEL_ID, { em: normalized });
  matchedEmail = normalized;
}

export function trackMeta(
  event: 'Lead' | 'InitiateCheckout' | 'Purchase',
  params: MetaEventParams = {},
  options: { email?: string; eventId?: string } = {},
) {
  try {
    if (!window.fbq) return false;
    if (options.email) applyAdvancedMatching(options.email);
    if (options.eventId) window.fbq('track', event, params, { eventID: options.eventId });
    else window.fbq('track', event, params);
    return true;
  } catch {
    // Meta tracking must never interrupt email capture or checkout.
    return false;
  }
}

export function trackMetaOnce(
  key: string,
  event: 'Lead' | 'InitiateCheckout' | 'Purchase',
  params: MetaEventParams = {},
  options: { email?: string; eventId?: string } = {},
) {
  const storageKey = `gossipcheck-meta-event:${key}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return false;
  } catch {
    // Continue without deduplication when browser storage is unavailable.
  }
  if (!trackMeta(event, params, options)) return false;
  try {
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // The event was sent even if its local deduplication marker could not be saved.
  }
  return true;
}
