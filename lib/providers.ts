import type { CreateScanRequest, EvidenceKind, SourceName } from './backend-types';
import { database, evidenceBucket, runtimeEnv } from './database';

type ProviderComment = {
  externalId?: string;
  author: string;
  text: string;
  postedAt?: string;
  reactions: number;
};

type ProviderEvidence = {
  source: SourceName;
  kind: EvidenceKind;
  provider: string;
  externalId?: string;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  confidence: number;
  providerScore?: number;
  reasons: string[];
  capturedAt?: string;
  subjectAge?: number;
  subjectLocation?: string;
  commentCount?: number;
  redFlags?: number;
  greenFlags?: number;
  metadata?: Record<string, unknown>;
  comments?: ProviderComment[];
  image?: { bytes: Uint8Array; mimeType: string };
};

type ProviderResult = {
  status: 'queued' | 'complete' | 'unconfigured' | 'failed';
  note: string;
  evidence: ProviderEvidence[];
};

type ProviderDefinition = {
  name: SourceName;
  run: (scanId: string, profile: CreateScanRequest) => Promise<ProviderResult>;
};

const cleanText = (value: unknown, max = 600) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const integer = (value: unknown, fallback = 0) => Math.max(0, Math.round(numberOrNull(value) ?? fallback));
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const setting = (name: string) => (runtimeEnv as unknown as Record<string, string | undefined>)[name] || process.env[name];
const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const containsTerm = (text: string, term: string) => ` ${normalized(text)} `.includes(` ${normalized(term)} `);

function safeUrl(value: unknown) {
  const candidate = cleanText(value, 1000);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => cleanText(item, 120)).filter(Boolean) : [];
}

function locationText(value: unknown) {
  if (typeof value === 'string') return cleanText(value, 160);
  const location = asRecord(value);
  return cleanText(location.name || location.city || location.label, 160);
}

function commentsFrom(value: unknown): ProviderComment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((entry) => {
    const item = asRecord(entry);
    const authorRecord = asRecord(item.author || item.user);
    return {
      externalId: cleanText(item.commentId || item.id, 240) || undefined,
      author: cleanText(authorRecord.name || authorRecord.username || item.author, 100) || 'Tea user',
      text: cleanText(item.text || item.content || item.caption, 1200),
      postedAt: cleanText(item.postedAt || item.createdAt, 50) || undefined,
      reactions: integer(item.reactions || item.reactionCount || item.likes),
    };
  }).filter((comment) => comment.text);
}

function decodeImage(value: unknown): ProviderEvidence['image'] | undefined {
  const input = cleanText(value, 3_000_000);
  if (!input) return undefined;
  const match = input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  const raw = match ? match[2] : input;
  const mimeType = match?.[1] || 'image/jpeg';
  try {
    const binary = atob(raw);
    if (!binary.length || binary.length > 2_500_000) return undefined;
    return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), mimeType };
  } catch {
    return undefined;
  }
}

function identitySignals(profile: CreateScanRequest, item: Record<string, unknown>) {
  const title = cleanText(item.subject || item.title, 200);
  const excerpt = cleanText(item.content || item.caption || item.excerpt || item.description, 1200);
  const haystack = `${title} ${excerpt}`;
  const itemAge = numberOrNull(item.age ?? item.estimatedAge ?? item.userAge);
  const itemLocation = locationText(item.location || item.city);
  const nameMatch = containsTerm(haystack, profile.firstName);
  const usernameMatch = profile.usernames.some((username) => containsTerm(haystack, username.replace(/^@/, '')));
  const locationMatch = Boolean(itemLocation && containsTerm(itemLocation, profile.city));
  const ageDelta = itemAge === null ? null : Math.abs(itemAge - profile.age);
  const faceScore = numberOrNull(item.faceScore ?? item.faceMatchScore);
  const reasons: string[] = [];
  let score = 5;

  if (nameMatch) { score += 25; reasons.push('First name appears in the post'); }
  if (ageDelta === 0) { score += 20; reasons.push('Age is an exact match'); }
  else if (ageDelta !== null && ageDelta <= 2) { score += 12; reasons.push(`Age is within ${ageDelta} year${ageDelta === 1 ? '' : 's'}`); }
  else if (ageDelta !== null && ageDelta <= 5) { score += 6; reasons.push(`Age is within ${ageDelta} years`); }
  if (locationMatch) { score += 25; reasons.push('Location matches'); }
  if (usernameMatch) { score += 30; reasons.push('Username appears'); }
  if (faceScore !== null && faceScore >= 83) { score += 35; reasons.push(`Provider face score ${Math.round(faceScore)}/100`); }
  else if (faceScore !== null && faceScore >= 70) { score += 18; reasons.push(`Provider face score ${Math.round(faceScore)}/100`); }

  const hasSpecificSignal = locationMatch || usernameMatch || (faceScore !== null && faceScore >= 70);
  if (!hasSpecificSignal) score = Math.min(score, 55);
  if (!nameMatch && !usernameMatch && (faceScore === null || faceScore < 70)) score = Math.min(score, 30);
  reasons.push('Post claims are unverified user content');

  return {
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    subjectAge: itemAge === null ? undefined : Math.round(itemAge),
    subjectLocation: itemLocation || undefined,
    providerScore: numberOrNull(item.matchScore ?? item.confidence) ?? undefined,
  };
}

function teaItems(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  const candidates = [root.results, root.posts, root.boxxPosts, root.items, asRecord(root.data).items, asRecord(root.data).posts];
  return candidates.flatMap((value) => Array.isArray(value) ? value : []);
}

function normalizeTeaResults(payload: unknown, profile: CreateScanRequest): ProviderEvidence[] {
  const seen = new Set<string>();
  const results: ProviderEvidence[] = [];
  for (const entry of teaItems(payload)) {
    const item = asRecord(entry);
    const title = cleanText(item.subject || item.title, 160) || 'Tea post candidate';
    const excerpt = cleanText(item.content || item.caption || item.excerpt || item.description, 1200);
    if (!excerpt && title === 'Tea post candidate') continue;
    const externalId = cleanText(item.postId || item.id || item.guid, 240);
    const dedupeKey = externalId || `${normalized(title)}:${normalized(excerpt)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const comments = commentsFrom(item.comments);
    const flags = asRecord(item.flags);
    const redFlagIds = stringList(item.redFlagIds);
    const greenFlagIds = stringList(item.greenFlagIds);
    const signals = identitySignals(profile, item);
    const imageBase64 = item.imageBase64 || asRecord(Array.isArray(item.photos) ? item.photos[0] : undefined).base64;
    results.push({
      source: 'Tea', kind: 'tea_post', provider: 'Authorized Tea connector', externalId: externalId || undefined,
      title, excerpt, sourceUrl: safeUrl(item.url || item.sourceUrl),
      confidence: signals.confidence, providerScore: signals.providerScore, reasons: signals.reasons,
      capturedAt: cleanText(item.postedAt || item.createdAt || item.capturedAt, 50) || undefined,
      subjectAge: signals.subjectAge, subjectLocation: signals.subjectLocation,
      commentCount: integer(item.commentCount ?? item.numberOfComments, comments.length),
      redFlags: integer(flags.red ?? item.redFlags, redFlagIds.length),
      greenFlags: integer(flags.green ?? item.greenFlags, greenFlagIds.length),
      comments, image: decodeImage(imageBase64),
      metadata: { approvalStage: cleanText(item.approvalStage, 80) || undefined, categoryIds: stringList(item.categoryIds), isNationwide: Boolean(item.isNationwide) },
    });
    if (results.length >= 80) break;
  }
  return results;
}

async function teaProvider(_scanId: string, profile: CreateScanRequest): Promise<ProviderResult> {
  const endpoint = setting('TEA_AUTHORIZED_ENDPOINT');
  const token = setting('TEA_AUTHORIZED_TOKEN');
  if (!endpoint || !token) return { status: 'queued', note: 'Awaiting an authorized Tea connector or manual analyst review.', evidence: [] };
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: profile.firstName, name: profile.firstName, age: profile.age, city: profile.city, location: profile.city, usernames: profile.usernames, radius: 100, purpose: 'self-search' }),
    });
    if (!response.ok) throw new Error(`provider returned ${response.status}`);
    const evidence = normalizeTeaResults(await response.json(), profile);
    return { status: 'complete', note: `${evidence.length} Tea candidate${evidence.length === 1 ? '' : 's'} returned. Identity confidence was recalculated from visible signals.`, evidence };
  } catch (error) {
    return { status: 'failed', note: error instanceof Error ? `Tea provider failed: ${error.message}` : 'Tea provider failed.', evidence: [] };
  }
}

async function faceCheckProvider(scanId: string, profile: CreateScanRequest): Promise<ProviderResult> {
  const photo = await database().prepare('SELECT object_key, mime_type FROM scan_photos WHERE scan_id = ?').bind(scanId).first<{ object_key: string; mime_type: string }>();
  if (!photo) return { status: 'complete', note: 'Skipped because no reference photo was added.', evidence: [] };
  if (profile.faceSearchConfirmed !== true) return { status: 'complete', note: 'Skipped because third-party face-search consent was not provided.', evidence: [] };
  const token = setting('FACE_CHECK_API_TOKEN');
  if (!token) return { status: 'unconfigured', note: 'Reference photo saved, but FaceCheck needs FACE_CHECK_API_TOKEN.', evidence: [] };

  try {
    const object = await evidenceBucket().get(photo.object_key);
    if (!object) throw new Error('reference photo was not found');
    const upload = new FormData();
    upload.append('images', new Blob([await object.arrayBuffer()], { type: photo.mime_type }), 'reference-photo');
    upload.append('id_search', '');
    const uploadResponse = await fetch('https://facecheck.id/api/upload_pic', { method: 'POST', headers: { Accept: 'application/json', Authorization: token }, body: upload });
    if (!uploadResponse.ok) throw new Error(`upload returned ${uploadResponse.status}`);
    const uploadPayload = asRecord(await uploadResponse.json());
    if (uploadPayload.error) throw new Error(`${cleanText(uploadPayload.error, 160)} (${cleanText(uploadPayload.code, 40)})`);
    const searchId = cleanText(uploadPayload.id_search, 240);
    if (!searchId) throw new Error('upload did not return a search ID');

    const testingMode = (setting('FACE_CHECK_TESTING_MODE') || '').toLowerCase() === 'true';
    const deadline = Date.now() + 55_000;
    let items: unknown[] = [];
    while (Date.now() < deadline) {
      const searchResponse = await fetch('https://facecheck.id/api/search', {
        method: 'POST', headers: { Accept: 'application/json', Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_search: searchId, with_progress: true, status_only: false, demo: testingMode }),
      });
      if (!searchResponse.ok) throw new Error(`search returned ${searchResponse.status}`);
      const searchPayload = asRecord(await searchResponse.json());
      if (searchPayload.error) throw new Error(`${cleanText(searchPayload.error, 160)} (${cleanText(searchPayload.code, 40)})`);
      const output = asRecord(searchPayload.output);
      if (Array.isArray(output.items)) { items = output.items; break; }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    if (!items.length) throw new Error('search did not complete within 55 seconds');

    const evidence = items.map((entry) => {
      const item = asRecord(entry);
      const url = safeUrl(item.url) || '';
      const score = Math.max(0, Math.min(100, integer(item.score)));
      if (!url || score < 50) return null;
      let hostname = 'the public web';
      try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { /* retain fallback */ }
      return {
        source: 'Face search' as const, kind: 'face_match' as const, provider: 'FaceCheck',
        externalId: cleanText(item.guid || item.index, 240) || undefined,
        title: `Possible face match on ${hostname}`,
        excerpt: 'A visually similar face was indexed on this public page. Confirm the person and page context yourself.',
        sourceUrl: url, confidence: score, providerScore: score,
        reasons: [`FaceCheck similarity score ${score}/100`, `Indexed on ${hostname}`, score < 83 ? 'Below FaceCheck high-confidence range' : 'High provider similarity score'],
        capturedAt: cleanText(item.seen, 50) || new Date().toISOString(), image: decodeImage(item.base64),
        metadata: { searchId, group: item.group, indexDB: item.indexDB },
      } satisfies ProviderEvidence;
    }).filter((item): item is ProviderEvidence => Boolean(item)).sort((a, b) => b.confidence - a.confidence).slice(0, 40);
    return { status: 'complete', note: `${evidence.length} FaceCheck web candidate${evidence.length === 1 ? '' : 's'} stored${testingMode ? ' in testing mode' : ''}. These results are separate from Tea posts.`, evidence };
  } catch (error) {
    return { status: 'failed', note: error instanceof Error ? `FaceCheck failed: ${error.message}` : 'FaceCheck failed.', evidence: [] };
  }
}

type UrlCitation = { url: string; title: string; content: string };

const publicSocialDomains = ['reddit.com', 'tiktok.com', 'instagram.com', 'threads.net', 'facebook.com'];
const publicDatingProfileDomains = ['tinder.com', 'hinge.co', 'bumble.com', 'badoo.com', 'okcupid.com', 'match.com', 'pof.com'];
const publicProfileDomains = [...publicDatingProfileDomains, 'instagram.com', 'tiktok.com', 'threads.net', 'facebook.com'];

const nameAliases: Record<string, string[]> = {
  alex: ['Alex', 'Alexander', 'Alejandro', 'Alexis', 'AJ'],
};

function searchNames(firstName: string) {
  return nameAliases[normalized(firstName)] || [firstName];
}

function searchLocations(city: string) {
  const terms = [city];
  const key = normalized(city);
  if (key.includes('new york')) terms.push('NYC', 'New York', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island');
  return [...new Set(terms)];
}

function citationRecords(payload: unknown): UrlCitation[] {
  const root = asRecord(payload);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  const seen = new Set<string>();
  const citations: UrlCitation[] = [];
  for (const annotation of annotations) {
    const citation = asRecord(asRecord(annotation).url_citation);
    const url = safeUrl(citation.url);
    if (!url) continue;
    const canonical = url.replace(/#.*$/, '');
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    citations.push({
      url,
      title: cleanText(citation.title, 200) || 'Public discussion candidate',
      content: cleanText(citation.content, 1800),
    });
  }
  return citations;
}


function datingGossipTopics(text: string) {
  const topics: string[] = [];
  if (/\b(any tea|what(?:'s| is) (?:the )?tea|tea on (?:him|her|them)|anyone know|anybody know|does anyone know|what do we know|experience(?:s)? with|tell me everything|spill tea|bring receipts|anything on (?:him|her|them)|who knows (?:him|her|them)|thoughts on (?:him|her|them))\b/i.test(text)) topics.push('Tea or experience request');
  if (/\b(dating (?:him|her|them|this (?:guy|girl|person))|been dating (?:him|her|them|this (?:guy|girl|person))|date with (?:him|her|them|this (?:guy|girl|person))|went on (?:a|one|our first) date with|going on (?:a|my first) date with|matched with (?:him|her|them|this (?:guy|girl|person))|matched (?:with [^.!?]{0,50} )?on (?:hinge|tinder|bumble)|met (?:him|her|them) on (?:hinge|tinder|bumble)|hook(?:ing|ed) up with (?:him|her|them|this (?:guy|girl|person))|been hook(?:ing|ed) up|friends? with benefits|\bfwb\b|talking to (?:him|her|them|this (?:guy|girl|person))|has (?:a|his|her) (?:girlfriend|boyfriend)|slid into my (?:tiktok )?dms|shoot(?:ing)? my shot|seeing (?:him|her|them)|been with (?:him|her|them))\b/i.test(text)) topics.push('Dating or relationship context');
  if (/\b(love bomb|ghost(?:ed|ing|s)?|communicat(?:e|es|ed|ing|ion|or)|emotionally unavailable|avoidant|manipulat(?:e|es|ed|ing|ive)|controll(?:ing|ed)|egotistical|full of (?:himself|herself|themself)|pathological liar|\bliar\b|\blied\b|\blies\b|dishonest|secretive|cheat(?:er|ed|ing|s)?|red flag|green flag|stay away|beware|sweet at first|genuine|treat(?:s|ed|ing)? (?:women|girls|people|me|her|him|them)|toxic|shady|felt something was off|true colors|intentions|waste your time|terrible communicator|afraid of change)\b/i.test(text)) topics.push('Behavior, personality, or treatment');
  if (/\b(abus(?:e|ed|ive)|assault(?:ed)?|stalk(?:ed|er|ing)?|threat(?:en|ened|ening|s)?|violent|violence|without consent|nonconsensual|harass(?:ed|ment|ing)?|underage|multiple minors|minor(?:s)?\b(?!\s+in\b)|std|sti|hsv|warrant|police report|unsafe)\b/i.test(text)) topics.push('Safety warning');
  if (/\b(green flag|good guy|nice guy|really nice|super nice|very sweet|respectful|kind|genuine|healthy relationship|treated me well)\b/i.test(text)) topics.push('Positive or green-flag experience');
  return [...new Set(topics)];
}

function publicIdentitySignals(profile: CreateScanRequest, citation: UrlCitation) {
  const haystack = `${citation.title} ${citation.content}`;
  const aliases = searchNames(profile.firstName);
  const locations = searchLocations(profile.city);
  const matchedName = aliases.find((term) => containsTerm(haystack, term));
  const matchedLocation = locations.find((term) => containsTerm(haystack, term));
  const matchedUsername = profile.usernames.find((term) => containsTerm(haystack, term.replace(/^@/, '')));
  const ages = [...haystack.matchAll(/\b(?:age[\s:]*)?(\d{2})\b/gi)].map((match) => Number(match[1])).filter((age) => age >= 18 && age <= 99);
  const ageDelta = ages.length ? Math.min(...ages.map((age) => Math.abs(age - profile.age))) : null;
  const gossipTopics = datingGossipTopics(haystack);
  const discussionSource = isPublicSocialUrl(citation.url);
  const reasons: string[] = [];
  let confidence = 5;

  if (matchedName) { confidence += 22; reasons.push(`Name variant “${matchedName}” appears in the source`); }
  if (ageDelta === 0) { confidence += 22; reasons.push(`Age ${profile.age} appears in the source`); }
  else if (ageDelta !== null && ageDelta <= 2) { confidence += 12; reasons.push(`An age mentioned is within ${ageDelta} year${ageDelta === 1 ? '' : 's'}`); }
  if (matchedLocation) { confidence += 25; reasons.push(`Location signal “${matchedLocation}” appears`); }
  if (matchedUsername) { confidence += 35; reasons.push(`Username ${matchedUsername.replace(/^@/, '')} appears`); }
  if (gossipTopics.length) { confidence += 10; reasons.push(`Dating/gossip topic: ${gossipTopics.join(', ')}`); }
  if (discussionSource) { confidence += 5; reasons.push('The citation is from a public social or forum page'); }

  const strongSignals = Number(Boolean(matchedLocation)) + Number(Boolean(matchedUsername)) + Number(ageDelta !== null && ageDelta <= 2);
  if (!matchedName && !matchedUsername) confidence = Math.min(confidence, 20);
  if (strongSignals === 0) confidence = Math.min(confidence, 38);
  if (strongSignals === 1) confidence = Math.min(confidence, 62);
  reasons.push('Public wording is unverified and may refer to a namesake');
  return { confidence: Math.max(0, Math.min(100, Math.round(confidence))), reasons, matchedName, matchedUsername, gossipTopics };
}

function isPublicSocialUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    return publicSocialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isSubjectOwnedSocialUrl(value: string, usernames: string[]) {
  if (!usernames.length) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment).toLocaleLowerCase().replace(/^@/, ''));
    const accounts = usernames.map((username) => normalized(username.replace(/^@/, ''))).filter(Boolean);
    let pathAccount = '';
    if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) pathAccount = segments[0] === 'user' ? segments[1] || '' : '';
    else pathAccount = segments[0] || '';
    return accounts.includes(normalized(pathAccount));
  } catch {
    return false;
  }
}

function isSocialProfileUrl(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) return segments[0]?.toLocaleLowerCase() === 'user' || segments[0]?.toLocaleLowerCase() === 'search' || (segments[0]?.toLocaleLowerCase() === 'r' && segments.length <= 2);
    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com')) return parsed.pathname.toLocaleLowerCase().includes('/profile.php');
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return segments[0]?.toLocaleLowerCase() === 'discover' || (segments.length === 1 && segments[0].startsWith('@'));
    if (hostname === 'threads.net' || hostname.endsWith('.threads.net')) return segments.length === 1 && segments[0].startsWith('@');
    if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return segments[0]?.toLocaleLowerCase() === 'explore' || segments.length === 1;
    if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) return segments.length === 1;
    return false;
  } catch {
    return true;
  }
}

function directProfilePlatform(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, '').toLocaleLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);
    const first = segments[0]?.toLocaleLowerCase() || '';
    const reservedSocialPaths = new Set(['about', 'accounts', 'business', 'discover', 'explore', 'help', 'legal', 'login', 'p', 'privacy', 'reel', 'reels', 'search', 'stories', 'terms']);

    if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return segments.length === 1 && !reservedSocialPaths.has(first) ? 'Instagram' : null;
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return segments.length === 1 && first.startsWith('@') ? 'TikTok' : null;
    if (hostname === 'threads.net' || hostname.endsWith('.threads.net')) return segments.length === 1 && first.startsWith('@') ? 'Threads' : null;
    if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com')) {
      if (first === 'profile.php' && parsed.searchParams.has('id')) return 'Facebook';
      return segments.length === 1 && !reservedSocialPaths.has(first) ? 'Facebook' : null;
    }
    if (hostname === 'tinder.com' || hostname.endsWith('.tinder.com')) return (segments.length === 1 && first.startsWith('@')) || ((first === 'profile' || first === 'profiles') && segments.length > 1) ? 'Tinder' : null;
    if (hostname === 'hinge.co' || hostname.endsWith('.hinge.co')) return (first === 'profile' || first === 'profiles') && segments.length > 1 ? 'Hinge' : null;
    if (hostname === 'bumble.com' || hostname.endsWith('.bumble.com')) return ((first === 'profile' || first === 'profiles' || first === 'app') && segments.length > 1) ? 'Bumble' : null;
    if (hostname === 'badoo.com' || hostname.endsWith('.badoo.com')) return (first === 'profile' || first === 'profiles') && segments.length > 1 ? 'Badoo' : null;
    if (hostname === 'okcupid.com' || hostname.endsWith('.okcupid.com')) return first === 'profile' && segments.length > 1 ? 'OkCupid' : null;
    if (hostname === 'match.com' || hostname.endsWith('.match.com')) return (first === 'profile' || first === 'profiles') && segments.length > 1 ? 'Match' : null;
    if (hostname === 'pof.com' || hostname.endsWith('.pof.com')) return (first === 'viewprofile.aspx' && parsed.searchParams.size > 0) || ((first === 'member' || first === 'profile') && segments.length > 1) ? 'Plenty of Fish' : null;
    return null;
  } catch {
    return null;
  }
}

function profileIdentitySignals(profile: CreateScanRequest, citation: UrlCitation, platform: string) {
  const haystack = `${citation.title} ${citation.content} ${citation.url}`;
  const aliases = searchNames(profile.firstName);
  const locations = searchLocations(profile.city);
  const matchedName = aliases.find((term) => containsTerm(haystack, term));
  const matchedLocation = locations.find((term) => containsTerm(haystack, term));
  const matchedUsername = profile.usernames.find((term) => containsTerm(haystack, term.replace(/^@/, '')));
  const ages = [...haystack.matchAll(/\b(?:age[\s:]*)?(\d{2})\b/gi)].map((match) => Number(match[1])).filter((age) => age >= 18 && age <= 99);
  const closestAge = ages.sort((left, right) => Math.abs(left - profile.age) - Math.abs(right - profile.age))[0];
  const ageDelta = closestAge === undefined ? null : Math.abs(closestAge - profile.age);
  const isDatingApp = ['Tinder', 'Hinge', 'Bumble', 'Badoo', 'OkCupid', 'Match', 'Plenty of Fish'].includes(platform);
  const reasons: string[] = [`Direct public ${platform} profile page`];
  let confidence = 5;

  if (matchedName) { confidence += 30; reasons.push(`Name variant “${matchedName}” appears`); }
  if (matchedUsername) { confidence += 40; reasons.push(`Username ${matchedUsername.replace(/^@/, '')} appears`); }
  if (ageDelta === 0) { confidence += 20; reasons.push(`Age ${profile.age} appears`); }
  else if (ageDelta !== null && ageDelta <= 2) { confidence += 10; reasons.push(`A listed age is within ${ageDelta} year${ageDelta === 1 ? '' : 's'}`); }
  if (matchedLocation) { confidence += 20; reasons.push(`Location signal “${matchedLocation}” appears`); }
  if (isDatingApp) { confidence += 5; reasons.push('Dating-app profile'); }
  if (!matchedUsername && !matchedName) confidence = 0;
  else if (!matchedUsername && !matchedLocation && (ageDelta === null || ageDelta > 2)) confidence = Math.min(confidence, 35);
  reasons.push('Public profile candidate may be a namesake; confirm the photos and details');

  return {
    confidence: Math.max(0, Math.min(95, Math.round(confidence))),
    reasons,
    matchedName,
    matchedUsername,
    subjectAge: ageDelta !== null && ageDelta <= 2 ? closestAge : undefined,
    subjectLocation: matchedLocation,
    isDatingApp,
  };
}

function looksLikeEntertainmentOrMedia(citation: UrlCitation) {
  if (/\bverified account\b/i.test(citation.content)) return true;
  try {
    const parsed = new URL(citation.url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => normalized(decodeURIComponent(segment)));
    if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) {
      const community = segments[0] === 'r' ? segments[1] || '' : '';
      return /(?:netflix|television|reality tv|celebrity|celebrities|fauxmoi|pop culture|selling sunset|love is blind|try guys|call her daddy|stardew valley|orange is the new black|tlc unexpected)/i.test(community);
    }
    const account = segments[0] || '';
    return /(?:^|\s)(?:news|radio|media|magazine|television|tv|hot\s*\d{2,4}|daily mail|entertainment|bright\s*side|brightside|bored\s*panda)(?:\s|$)/i.test(account);
  } catch {
    return true;
  }
}

function searchBrief(profile: CreateScanRequest) {
  return {
    subject: { firstName: profile.firstName, age: profile.age, city: profile.city, usernames: profile.usernames },
    nameVariants: searchNames(profile.firstName),
    ageVariants: [profile.age, profile.age - 1, profile.age + 1].filter((age) => age >= 18),
    locationVariants: searchLocations(profile.city),
    discussionPhrases: [
      'any tea', 'what is the tea', 'anyone know him', 'what do we know', 'experiences with him', 'tell me everything',
      'matched with him on Hinge', 'talking to this guy', 'hooking up with him', 'old FWB', 'went on a date',
      'red flag', 'green flag', 'ghosted', 'terrible communicator', 'emotionally unavailable', 'manipulative',
      'cheater', 'love bomber', 'has a girlfriend', 'catfish', 'beware', 'stay away', 'bring receipts',
    ],
    sourceTargets: ['Reddit posts and comments', 'TikTok posts', 'public Instagram posts', 'Threads posts', 'public Facebook posts'],
  };
}

async function openRouterSocialSearch(apiKey: string, model: string, systemPrompt: string, userPrompt: string, maxTotalResults: number, allowedDomains: string[], engine: 'exa' | 'parallel') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'GossipCheck',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_completion_tokens: 2000,
        max_tool_calls: 2,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        tools: [{
          type: 'openrouter:web_search',
          parameters: { engine, max_results: Math.min(25, maxTotalResults), max_total_results: maxTotalResults, max_characters: 1400, allowed_domains: allowedDomains },
        }],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      const providerMessage = cleanText(asRecord(asRecord(payload).error).message, 160);
      throw new Error(providerMessage || `provider returned ${response.status}`);
    }
    return citationRecords(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function profileEvidenceFromCitations(profile: CreateScanRequest, citations: UrlCitation[], model: string, searchEngine: 'exa' | 'parallel') {
  const deduped = [...new Map(citations.map((citation) => [citation.url.replace(/#.*$/, ''), citation])).values()];
  return deduped.map((citation): ProviderEvidence | null => {
    const platform = directProfilePlatform(citation.url);
    if (!platform || looksLikeEntertainmentOrMedia(citation)) return null;
    const signals = profileIdentitySignals(profile, citation, platform);
    if (!signals.matchedName && !signals.matchedUsername) return null;
    const identity = signals.matchedUsername?.replace(/^@/, '') || signals.matchedName || profile.firstName;
    const genericTitle = /^(?:instagram|tiktok|threads|facebook|tinder|hinge|bumble|badoo|okcupid|match|plenty of fish)(?: profile)?$/i.test(citation.title);
    return {
      source: 'Public web',
      kind: 'profile_match',
      provider: `OpenRouter · ${model} · ${searchEngine === 'parallel' ? 'Parallel' : 'Exa'}`,
      externalId: citation.url,
      title: genericTitle ? `${identity} on ${platform}` : citation.title,
      excerpt: citation.content || `A public ${platform} profile was indexed with this name or username.`,
      sourceUrl: citation.url,
      confidence: signals.confidence,
      reasons: signals.reasons,
      capturedAt: new Date().toISOString(),
      subjectAge: signals.subjectAge,
      subjectLocation: signals.subjectLocation,
      metadata: { model, searchEngine, platform, isDatingApp: signals.isDatingApp, citationValidated: true },
    };
  }).filter((item): item is ProviderEvidence => Boolean(item)).sort((left, right) => {
    const leftDating = Boolean(left.metadata?.isDatingApp);
    const rightDating = Boolean(right.metadata?.isDatingApp);
    return Number(rightDating) - Number(leftDating) || right.confidence - left.confidence;
  }).slice(0, 30);
}

async function discoverProfileEvidence(apiKey: string, model: string, searchEngine: 'exa' | 'parallel', profile: CreateScanRequest) {
  const brief = searchBrief(profile);
  const systemPrompt = 'You are a public-profile discovery agent for a consented self-search. Find direct, publicly indexed profile pages whose displayed name or username matches the supplied identifiers. Prioritize dating apps, then public social profiles. Cite only the direct profile URL—not search pages, posts, articles, help pages, directories, login pages, marketing pages, leaked data, or private/access-controlled content. Never invent a profile or claim that namesakes are the same person.';
  const profilePrompt = `Find direct public profile pages matching this person:\n${JSON.stringify(brief.subject)}\nName variants: ${brief.nameVariants.join(', ')}\nAge variants: ${brief.ageVariants.join(', ')}\nLocation variants: ${brief.locationVariants.join(', ')}\n\nSearch Tinder, Hinge, Bumble, Badoo, OkCupid, Match, and Plenty of Fish first, then Instagram, TikTok, Threads, and Facebook. Use exact usernames when supplied, followed by name + age + city and name + city. Return direct profile pages only—not individual posts—and cite every result you can verify from the indexed page title, URL, or excerpt.`;
  const searches = await Promise.allSettled([
    openRouterSocialSearch(apiKey, model, systemPrompt, profilePrompt, 25, publicProfileDomains, searchEngine),
  ]);
  const citations = searches.flatMap((search) => search.status === 'fulfilled' ? search.value : []);
  const evidence = profileEvidenceFromCitations(profile, citations, model, searchEngine);
  const failures = searches.filter((search) => search.status === 'rejected').length;
  if (failures === searches.length && !evidence.length) {
    const firstFailure = searches.find((search): search is PromiseRejectedResult => search.status === 'rejected');
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error('public profile searches failed');
  }
  return { evidence, failures };
}

async function publicProfileProvider(profile: CreateScanRequest): Promise<ProviderResult> {
  const apiKey = setting('OPENROUTER_API_KEY');
  const model = setting('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash-0731';
  const searchEngine: 'exa' | 'parallel' = setting('OPENROUTER_SEARCH_ENGINE') === 'exa' ? 'exa' : 'parallel';
  if (!apiKey) return { status: 'unconfigured', note: 'Public-profile discovery needs OPENROUTER_API_KEY.', evidence: [] };
  try {
    const result = await discoverProfileEvidence(apiKey, model, searchEngine, profile);
    return {
      status: 'complete',
      note: `${result.evidence.length} direct public profile${result.evidence.length === 1 ? '' : 's'} retained. One combined pass prioritized dating apps, then public social profiles.${result.failures ? ' The profile-search pass failed, so coverage is incomplete.' : ''}`,
      evidence: result.evidence,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'provider timed out' : error instanceof Error ? error.message : 'unknown provider error';
    return { status: 'failed', note: `OpenRouter profile discovery failed: ${message}`, evidence: [] };
  }
}

function postEvidenceFromCitations(profile: CreateScanRequest, citations: UrlCitation[], model: string, searchEngine: 'exa' | 'parallel') {
  const brief = searchBrief(profile);
  const deduped = [...new Map(citations.map((citation) => [citation.url.replace(/#.*$/, ''), citation])).values()];
  return deduped.map((citation): ProviderEvidence | null => {
    const signals = publicIdentitySignals(profile, citation);
    if ((!signals.matchedName && !signals.matchedUsername) || !citation.content || !isPublicSocialUrl(citation.url) || isSocialProfileUrl(citation.url) || isSubjectOwnedSocialUrl(citation.url, profile.usernames) || looksLikeEntertainmentOrMedia(citation)) return null;
    let hostname = 'public web';
    try { hostname = new URL(citation.url).hostname.replace(/^www\./, ''); } catch { /* safeUrl already validated */ }
    const broadMention = signals.gossipTopics.length === 0;
    return {
      source: 'Public web',
      kind: 'web_page',
      provider: `OpenRouter · ${model} · ${searchEngine === 'parallel' ? 'Parallel' : 'Exa'}`,
      externalId: citation.url,
      title: citation.title,
      excerpt: citation.content,
      sourceUrl: citation.url,
      confidence: signals.confidence,
      reasons: broadMention ? [...signals.reasons, 'Broad social name mention retained for manual review'] : signals.reasons,
      capturedAt: new Date().toISOString(),
      metadata: { model, searchEngine, searchBrief: brief, hostname, citationValidated: true, rankingTier: broadMention ? 'broad-name' : 'dating-context' },
    };
  }).filter((item): item is ProviderEvidence => Boolean(item)).sort((left, right) => {
    const leftDating = left.metadata?.rankingTier === 'dating-context';
    const rightDating = right.metadata?.rankingTier === 'dating-context';
    return Number(rightDating) - Number(leftDating) || right.confidence - left.confidence;
  }).slice(0, 40);
}

async function discoverPostEvidence(apiKey: string, model: string, searchEngine: 'exa' | 'parallel', profile: CreateScanRequest) {
  const brief = searchBrief(profile);
  const systemPrompt = 'You are a public-social research agent for a consented self-search. Find direct public posts, comments, replies, and threads where other accounts mention or discuss the supplied name, name variants, or username. Prioritize dating experiences, tea requests, relationship behavior, personality, treatment, red/green flags, and safety concerns, but also retain broader conversational posts that are clearly about a person with that name. Cite the direct post URL. Exclude profiles, newspapers, news articles, blogs, commercial pages, directories, public figures, entertainment/fan content, and private, leaked, paywalled, or access-controlled material. Treat every post as unverified and never assume namesakes are the same person.';
  const redditPrompt = `Search Reddit for public posts and comments matching this self-search profile:\n${JSON.stringify(brief)}\n\nTry the exact name with age, city, and username first. Then broaden to every name variant paired with dating, boyfriend/girlfriend, ex, ghosted, cheating, love bombed, red flag, green flag, anyone know, experiences with, Hinge, Tinder, hookup, FWB, or treated me. Retain terse tea requests and broader conversational mentions of a person with that name. Cite each direct post or comment.`;
  const socialPrompt = `Search public TikTok, Instagram, Threads, and Facebook posts matching this self-search profile:\n${JSON.stringify(brief)}\n\nTry exact username and name + age + city first, then broaden to each name variant with dating, relationship, personality, treatment, warning, tea, red-flag, and green-flag concepts. Keep posts by other accounts that mention the name even when age or city is absent. Return direct post URLs, not profiles, and cite each result.`;
  const otherSocialDomains = publicSocialDomains.filter((domain) => domain !== 'reddit.com');
  const searches = await Promise.allSettled([
    openRouterSocialSearch(apiKey, model, systemPrompt, redditPrompt, 30, ['reddit.com'], searchEngine),
    openRouterSocialSearch(apiKey, model, systemPrompt, socialPrompt, 30, otherSocialDomains, searchEngine),
  ]);
  const citations = searches.flatMap((search) => search.status === 'fulfilled' ? search.value : []);
  const failures = searches.filter((search) => search.status === 'rejected').length;
  if (failures === searches.length && !citations.length) {
    const firstFailure = searches.find((search): search is PromiseRejectedResult => search.status === 'rejected');
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error('public post searches failed');
  }
  return { evidence: postEvidenceFromCitations(profile, citations, model, searchEngine), failures, citedCandidates: citations.length };
}

async function publicPostProvider(profile: CreateScanRequest): Promise<ProviderResult> {
  const apiKey = setting('OPENROUTER_API_KEY');
  const model = setting('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash-0731';
  const searchEngine: 'exa' | 'parallel' = setting('OPENROUTER_SEARCH_ENGINE') === 'exa' ? 'exa' : 'parallel';
  if (!apiKey) return { status: 'unconfigured', note: 'Cited public-post discovery needs OPENROUTER_API_KEY.', evidence: [] };
  try {
    const result = await discoverPostEvidence(apiKey, model, searchEngine, profile);
    const weak = result.evidence.filter((item) => item.confidence < 50).length;
    const weakNote = weak ? `${weak} ${weak === 1 ? 'is a weak possible namesake' : 'are weak possible namesakes'}` : 'no weak possible namesakes were retained';
    return {
      status: 'complete',
      note: `${result.evidence.length} source-cited post${result.evidence.length === 1 ? '' : 's'} retained from ${result.citedCandidates} cited candidate${result.citedCandidates === 1 ? '' : 's'}; ${weakNote}. Two domain-restricted passes searched Reddit and public TikTok, Instagram, Threads, and Facebook in parallel. Dating/gossip posts rank first, while broader social name mentions are kept for manual review. No second AI-classification pass or fallback search is used.${result.failures ? ` ${result.failures} of 2 post-search passes failed, so coverage is incomplete.` : ''}`,
      evidence: result.evidence,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'provider timed out' : error instanceof Error ? error.message : 'unknown provider error';
    return { status: 'failed', note: `OpenRouter post discovery failed: ${message}`, evidence: [] };
  }
}

async function publicWebProvider(_scanId: string, profile: CreateScanRequest): Promise<ProviderResult> {
  const [posts, profiles] = await Promise.all([publicPostProvider(profile), publicProfileProvider(profile)]);
  if (posts.status === 'unconfigured' && profiles.status === 'unconfigured') return { status: 'unconfigured', note: posts.note, evidence: [] };
  if (posts.status === 'failed' && profiles.status === 'failed') return { status: 'failed', note: `${posts.note} ${profiles.note}`, evidence: [] };
  return {
    status: 'complete',
    note: `${posts.note} ${profiles.note}`,
    evidence: [...(posts.status === 'complete' ? posts.evidence : []), ...(profiles.status === 'complete' ? profiles.evidence : [])],
  };
}

async function persistResult(scanId: string, sessionId: string, source: SourceName, result: ProviderResult) {
  const finished = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const objectKeys: string[] = [];
  try {
    for (const item of result.evidence) {
      const evidenceId = crypto.randomUUID();
      let objectKey: string | null = null;
      if (item.image) {
        objectKey = `${sessionId}/${scanId}/provider-${evidenceId}`;
        await evidenceBucket().put(objectKey, item.image.bytes, { httpMetadata: { contentType: item.image.mimeType }, customMetadata: { provider: item.provider } });
        objectKeys.push(objectKey);
      }
      statements.push(database().prepare(`
        INSERT INTO evidence (id, scan_id, session_id, source, kind, provider, external_id, title, excerpt, source_url, confidence, provider_score, reasons_json, subject_age, subject_location, comment_count, red_flags, green_flags, metadata_json, captured_at, object_key, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(evidenceId, scanId, sessionId, item.source, item.kind, item.provider, item.externalId || null, item.title, item.excerpt, item.sourceUrl || null, item.confidence, item.providerScore ?? null, JSON.stringify(item.reasons), item.subjectAge ?? null, item.subjectLocation || null, item.commentCount || 0, item.redFlags || 0, item.greenFlags || 0, JSON.stringify(item.metadata || {}), item.capturedAt || finished, objectKey, item.image?.mimeType || null, finished));
      for (const comment of item.comments || []) statements.push(database().prepare('INSERT INTO evidence_comments (id, evidence_id, external_id, author, text, posted_at, reactions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), evidenceId, comment.externalId || null, comment.author, comment.text, comment.postedAt || null, comment.reactions, finished));
    }
    statements.push(database().prepare('UPDATE source_runs SET status = ?, note = ?, completed_at = ? WHERE scan_id = ? AND source = ?').bind(result.status, result.note, result.status === 'queued' ? null : finished, scanId, source));
    for (let index = 0; index < statements.length; index += 75) await database().batch(statements.slice(index, index + 75));
  } catch (error) {
    await database().prepare("DELETE FROM evidence WHERE scan_id = ? AND source = ? AND kind != 'manual_import'").bind(scanId, source).run().catch(() => undefined);
    await Promise.all(objectKeys.map((key) => evidenceBucket().delete(key).catch(() => undefined)));
    throw error;
  }
}

export async function refreshProfileDiscovery(scanId: string, sessionId: string, profile: CreateScanRequest) {
  const result = await publicProfileProvider(profile);
  if (result.status !== 'complete') return result;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    database().prepare("DELETE FROM evidence WHERE scan_id = ? AND session_id = ? AND kind = 'profile_match'").bind(scanId, sessionId),
  ];
  for (const item of result.evidence) {
    statements.push(database().prepare(`
      INSERT INTO evidence (id, scan_id, session_id, source, kind, provider, external_id, title, excerpt, source_url, confidence, provider_score, reasons_json, subject_age, subject_location, comment_count, red_flags, green_flags, metadata_json, captured_at, object_key, mime_type, created_at)
      VALUES (?, ?, ?, ?, 'profile_match', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, NULL, ?)
    `).bind(crypto.randomUUID(), scanId, sessionId, item.source, item.provider, item.externalId || null, item.title, item.excerpt, item.sourceUrl || null, item.confidence, item.providerScore ?? null, JSON.stringify(item.reasons), item.subjectAge ?? null, item.subjectLocation || null, JSON.stringify(item.metadata || {}), item.capturedAt || now, now));
  }
  statements.push(database().prepare("UPDATE source_runs SET status = 'complete', note = ?, completed_at = ? WHERE scan_id = ? AND source = 'Public web'").bind(result.note, now, scanId));
  for (let index = 0; index < statements.length; index += 75) await database().batch(statements.slice(index, index + 75));
  return result;
}

export async function refreshPostDiscovery(scanId: string, sessionId: string, profile: CreateScanRequest) {
  const result = await publicPostProvider(profile);
  if (result.status !== 'complete') return result;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    database().prepare("DELETE FROM evidence WHERE scan_id = ? AND session_id = ? AND kind = 'web_page'").bind(scanId, sessionId),
  ];
  for (const item of result.evidence) {
    statements.push(database().prepare(`
      INSERT INTO evidence (id, scan_id, session_id, source, kind, provider, external_id, title, excerpt, source_url, confidence, provider_score, reasons_json, subject_age, subject_location, comment_count, red_flags, green_flags, metadata_json, captured_at, object_key, mime_type, created_at)
      VALUES (?, ?, ?, ?, 'web_page', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, NULL, ?)
    `).bind(crypto.randomUUID(), scanId, sessionId, item.source, item.provider, item.externalId || null, item.title, item.excerpt, item.sourceUrl || null, item.confidence, item.providerScore ?? null, JSON.stringify(item.reasons), item.subjectAge ?? null, item.subjectLocation || null, JSON.stringify(item.metadata || {}), item.capturedAt || now, now));
  }
  statements.push(database().prepare("UPDATE source_runs SET status = 'complete', note = ?, completed_at = ? WHERE scan_id = ? AND source = 'Public web'").bind(result.note, now, scanId));
  for (let index = 0; index < statements.length; index += 75) await database().batch(statements.slice(index, index + 75));
  return result;
}

export async function runProviders(scanId: string, sessionId: string, profile: CreateScanRequest) {
  const providers: ProviderDefinition[] = [
    { name: 'Tea', run: teaProvider },
    { name: 'Face search', run: faceCheckProvider },
    { name: 'Public web', run: publicWebProvider },
  ];
  const started = new Date().toISOString();
  await database().batch(providers.map((provider) => database().prepare('UPDATE source_runs SET status = ?, note = ?, started_at = ? WHERE scan_id = ? AND source = ?').bind('running', `Checking ${provider.name}…`, started, scanId, provider.name)));
  const results = await Promise.all(providers.map(async (provider) => ({ provider, result: await provider.run(scanId, profile) })));
  for (const { provider, result } of results) await persistResult(scanId, sessionId, provider.name, result);
}
