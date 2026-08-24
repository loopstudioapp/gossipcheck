import { database, ensureSchema } from './database';

const cookieName = 'gc_session';

async function digest(token: string) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cookieValue(request: Request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function sessionFor(request: Request) {
  await ensureSchema();
  const existing = cookieValue(request);
  const token = existing && existing.length >= 32 ? existing : `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const id = await digest(token);
  const now = new Date().toISOString();

  await database().prepare(`
    INSERT INTO sessions (id, created_at, last_seen_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).bind(id, now, now).run();

  return {
    id,
    isNew: token !== existing,
    attach(response: Response) {
      if (token !== existing) {
        const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
        response.headers.append('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`);
      }
      return response;
    },
  };
}
