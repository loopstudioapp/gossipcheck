import { runtimeEnv } from './database';

type ReviewEnv = { ANALYST_REVIEW_TOKEN?: string };

export function configuredReviewToken() {
  return (runtimeEnv as unknown as ReviewEnv).ANALYST_REVIEW_TOKEN || process.env.ANALYST_REVIEW_TOKEN || '';
}

async function tokenDigest(value: string) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function reviewerAuthorized(request: Request) {
  const expected = configuredReviewToken();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !supplied) return false;
  const [expectedDigest, suppliedDigest] = await Promise.all([tokenDigest(expected), tokenDigest(supplied)]);
  let difference = expectedDigest.length ^ suppliedDigest.length;
  for (let index = 0; index < expectedDigest.length; index += 1) difference |= expectedDigest[index] ^ (suppliedDigest[index] || 0);
  return difference === 0;
}
