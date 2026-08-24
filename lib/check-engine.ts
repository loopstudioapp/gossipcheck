export type CheckRequest = {
  firstName: string;
  age: number;
  city: string;
  usernames: string[];
  selfSearchConfirmed: boolean;
};

export type MatchConfidence = 'likely' | 'possible';

export type CheckMatch = {
  id: string;
  source: 'Tea' | 'Public web';
  confidence: number;
  label: MatchConfidence;
  headline: string;
  excerpt: string;
  reasons: string[];
  capturedAt: string;
  isDemo: true;
};

export type SourceSummary = {
  name: string;
  state: 'demo' | 'checked';
  matches: number;
  note: string;
};

export type CheckResponse = {
  scanId: string;
  mode: 'demo';
  profile: Pick<CheckRequest, 'firstName' | 'age' | 'city'>;
  sources: SourceSummary[];
  matches: CheckMatch[];
  disclaimer: string;
};

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

export function runDemoCheck(request: CheckRequest): CheckResponse {
  const firstName = clean(request.firstName);
  const city = clean(request.city);
  const capturedAt = new Date().toISOString();
  const hasUsernames = request.usernames.some(Boolean);

  return {
    scanId: `demo_${crypto.randomUUID()}`,
    mode: 'demo',
    profile: { firstName, age: request.age, city },
    sources: [
      {
        name: 'Tea',
        state: 'demo',
        matches: 1,
        note: 'Workflow preview. Live results require authorized Tea access.',
      },
      {
        name: 'Public web',
        state: 'checked',
        matches: 1,
        note: 'Sample indexed-web candidate.',
      },
      {
        name: 'Reddit',
        state: 'checked',
        matches: 0,
        note: 'No sample candidates in this demo.',
      },
    ],
    matches: [
      {
        id: 'tea_demo_1',
        source: 'Tea',
        confidence: hasUsernames ? 88 : 81,
        label: 'likely',
        headline: `Sample Tea candidate in ${city}`,
        excerpt: `Demo content: “Met ${firstName} through a dating app in ${city}…” Live post text and screenshots would appear here only through authorized access.`,
        reasons: hasUsernames
          ? ['Exact first name', 'Same city', 'Username signal']
          : ['Exact first name', 'Same city', 'Age within range'],
        capturedAt,
        isDemo: true,
      },
      {
        id: 'web_demo_1',
        source: 'Public web',
        confidence: 56,
        label: 'possible',
        headline: `Possible public mention of ${firstName}`,
        excerpt: `Demo content: a public page contains the same first name and a reference to ${city}, but lacks enough detail for a strong match.`,
        reasons: ['Same first name', 'Location mentioned', 'No username match'],
        capturedAt,
        isDemo: true,
      },
    ],
    disclaimer: 'These are generated demonstration results, not live Tea or web data.',
  };
}
