import type { CreateScanRequest, SourceName } from './backend-types';
import { database, runtimeEnv } from './database';

type ProviderEvidence = {
  source: SourceName;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  confidence: number;
  reasons: string[];
  capturedAt?: string;
};

type ProviderResult = {
  status: 'complete' | 'unconfigured' | 'failed';
  note: string;
  evidence: ProviderEvidence[];
};

const cleanText = (value: unknown, max = 600) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const setting = (name: 'BRAVE_SEARCH_API_KEY' | 'TEA_AUTHORIZED_ENDPOINT' | 'TEA_AUTHORIZED_TOKEN') =>
  runtimeEnv[name] || process.env[name];

async function teaProvider(profile: CreateScanRequest): Promise<ProviderResult> {
  const endpoint = setting('TEA_AUTHORIZED_ENDPOINT');
  const token = setting('TEA_AUTHORIZED_TOKEN');
  if (!endpoint || !token) {
    return {
      status: 'unconfigured',
      note: 'No authorized Tea data provider is configured. Import screenshots or links you lawfully possess below.',
      evidence: [],
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: profile.firstName,
        age: profile.age,
        city: profile.city,
        usernames: profile.usernames,
        purpose: 'self-search',
      }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const payload = await response.json() as { results?: unknown[] };
    const evidence = (Array.isArray(payload.results) ? payload.results : []).slice(0, 25).map((item) => {
      const result = item as Record<string, unknown>;
      return {
        source: 'Tea' as const,
        title: cleanText(result.title, 160) || 'Tea mention',
        excerpt: cleanText(result.excerpt),
        sourceUrl: cleanText(result.url, 1000) || undefined,
        confidence: Math.max(0, Math.min(100, Number(result.confidence) || 0)),
        reasons: Array.isArray(result.reasons) ? result.reasons.filter((value): value is string => typeof value === 'string').slice(0, 6) : [],
        capturedAt: cleanText(result.capturedAt, 40) || undefined,
      };
    });
    return { status: 'complete', note: `Authorized Tea provider checked; ${evidence.length} candidate${evidence.length === 1 ? '' : 's'} returned.`, evidence };
  } catch (error) {
    return { status: 'failed', note: error instanceof Error ? `Tea provider failed: ${error.message}` : 'Tea provider failed.', evidence: [] };
  }
}

async function publicWebProvider(profile: CreateScanRequest): Promise<ProviderResult> {
  const apiKey = setting('BRAVE_SEARCH_API_KEY');
  if (!apiKey) {
    return { status: 'unconfigured', note: 'Public web search is ready but needs BRAVE_SEARCH_API_KEY in .env.local.', evidence: [] };
  }

  try {
    const terms = [`\"${profile.firstName}\"`, `\"${profile.city}\"`, ...profile.usernames.map((name) => `\"${name}\"`)].join(' ');
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(terms)}&count=10&safesearch=strict`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    });
    if (!response.ok) throw new Error(`Search provider returned ${response.status}`);
    const payload = await response.json() as { web?: { results?: Array<{ title?: string; description?: string; url?: string; age?: string }> } };
    const evidence = (payload.web?.results || []).map((result) => {
      const haystack = `${result.title || ''} ${result.description || ''}`.toLowerCase();
      const reasons = [
        haystack.includes(profile.firstName.toLowerCase()) ? 'First name appears' : '',
        haystack.includes(profile.city.toLowerCase()) ? 'Location appears' : '',
        profile.usernames.some((username) => haystack.includes(username.replace(/^[@/u]+/, '').toLowerCase())) ? 'Username appears' : '',
      ].filter(Boolean);
      return {
        source: 'Public web' as const,
        title: cleanText(result.title, 160) || 'Public web mention',
        excerpt: cleanText(result.description),
        sourceUrl: cleanText(result.url, 1000) || undefined,
        confidence: Math.min(92, 35 + reasons.length * 18),
        reasons,
        capturedAt: result.age || undefined,
      };
    });
    return { status: 'complete', note: `Public web checked; ${evidence.length} candidate${evidence.length === 1 ? '' : 's'} returned.`, evidence };
  } catch (error) {
    return { status: 'failed', note: error instanceof Error ? `Public web search failed: ${error.message}` : 'Public web search failed.', evidence: [] };
  }
}

export async function runProviders(scanId: string, sessionId: string, profile: CreateScanRequest) {
  const providers = [
    { name: 'Tea' as const, run: teaProvider },
    { name: 'Public web' as const, run: publicWebProvider },
  ];

  for (const provider of providers) {
    const now = new Date().toISOString();
    await database().prepare('UPDATE source_runs SET status = ?, started_at = ? WHERE scan_id = ? AND source = ?')
      .bind('running', now, scanId, provider.name).run();
    const result = await provider.run(profile);
    const finished = new Date().toISOString();
    const writes: D1PreparedStatement[] = [
      database().prepare('UPDATE source_runs SET status = ?, note = ?, completed_at = ? WHERE scan_id = ? AND source = ?')
        .bind(result.status, result.note, finished, scanId, provider.name),
    ];
    for (const item of result.evidence) {
      writes.push(database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, title, excerpt, source_url, confidence, reasons_json, captured_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), scanId, sessionId, item.source, item.title, item.excerpt, item.sourceUrl || null, item.confidence, JSON.stringify(item.reasons), item.capturedAt || finished, finished));
    }
    await database().batch(writes);
  }
}
