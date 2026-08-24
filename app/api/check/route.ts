import { NextResponse } from 'next/server';
import { runDemoCheck, type CheckRequest } from '../../../lib/check-engine';

export async function POST(request: Request) {
  let body: Partial<CheckRequest>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const firstName = body.firstName?.trim();
  const city = body.city?.trim();
  const age = Number(body.age);

  if (!firstName || !city || !Number.isInteger(age) || age < 18 || age > 99) {
    return NextResponse.json({ error: 'Enter a valid name, city, and age between 18 and 99.' }, { status: 400 });
  }

  if (body.selfSearchConfirmed !== true) {
    return NextResponse.json({ error: 'This demo is limited to self-searches.' }, { status: 403 });
  }

  const payload: CheckRequest = {
    firstName,
    city,
    age,
    usernames: Array.isArray(body.usernames)
      ? body.usernames.filter((item): item is string => typeof item === 'string').slice(0, 4)
      : [],
    selfSearchConfirmed: true,
  };

  return NextResponse.json(runDemoCheck(payload));
}
