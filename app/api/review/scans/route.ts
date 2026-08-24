import { NextResponse } from 'next/server';
import { database, ensureSchema } from '../../../../lib/database';
import { configuredReviewToken, reviewerAuthorized } from '../../../../lib/review-auth';

export const dynamic = 'force-dynamic';

type QueueRow = {
  id: string;
  created_at: string;
  first_name: string;
  age: number;
  city: string;
  usernames_json: string;
  has_photo: number;
};

export async function GET(request: Request) {
  if (!configuredReviewToken()) return NextResponse.json({ error: 'Analyst review is not configured.' }, { status: 503 });
  if (!await reviewerAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    await ensureSchema();
    const rows = (await database().prepare(`
      SELECT s.id, s.created_at, p.first_name, p.age, p.city, p.usernames_json,
        EXISTS(SELECT 1 FROM scan_photos sp WHERE sp.scan_id = s.id) AS has_photo
      FROM scans s
      JOIN profiles p ON p.id = s.profile_id
      JOIN source_runs sr ON sr.scan_id = s.id AND sr.source = 'Tea'
      WHERE sr.status = 'queued'
      ORDER BY s.created_at ASC
      LIMIT 100
    `).all<QueueRow>()).results;

    return NextResponse.json({ scans: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      firstName: row.first_name,
      age: row.age,
      city: row.city,
      usernames: JSON.parse(row.usernames_json || '[]') as string[],
      photoUrl: row.has_photo ? `/api/review/scans/${row.id}/photo` : null,
    })) });
  } catch (error) {
    console.error('Could not load analyst queue', error);
    return NextResponse.json({ error: 'The analyst queue could not be loaded.' }, { status: 500 });
  }
}
