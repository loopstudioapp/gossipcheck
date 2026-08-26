# GossipCheck — shared project brain

This file is auto-loaded by every Claude Code / ox-alpha session in this repo. It is maintained
by the worker crew: **read it before working, update it when the code changes.** The companion
file `.claude/shared-memory.md` holds the same brief plus crew rules.

## What this product is

GossipCheck (`gossipcheck.app`, repo name "gossipcheck") is a **self-search reputation checker**
for adults who date on apps: you enter your own first name, age, city, optional Instagram
username, and optional photo, and it builds a persistent private report of public posts,
dating/social profiles, and face-search candidates that might refer to you. It is inspired by
the Tea app's public funnel/report shape but deliberately does **not** copy Tea's branding,
personal report data, or marketing claims, and never fabricates preview posts.

Positioning: "Know what they say about you." Every result ships with source link, captured
date, and a locally-computed identity-confidence score plus human-readable reasons, because
matches are treated as leads to verify — never proof.

## Main flow

`/check` (entry point, noindex) is one client component, `app/check/check-flow.tsx`:

1. **Onboarding — 11 steps, locked to viewport**: 1 first name · 2 age (18–99 enforced
   client+server) · 3 city with Google Maps embed confirm · 4 source-coverage marketing ·
   5 "at stake" · 6 relatable experiences (collected but never sent to providers) ·
   7 post-spread timeline · 8 how-it-works · 9 optional Instagram handle · 10 testimonials ·
   11 optional photo + **explicit FaceCheck consent checkbox** (required to enable face search).
2. Client POSTs `/api/scans` (creates profile + scan + 3 `source_runs` rows; returns an
   unguessable `accessToken` whose SHA-256 hash is stored), optionally uploads the photo, then
   POSTs `/api/scans/{id}/run`, which runs all providers **synchronously**. Scan responses are
   **redacted server-side until the report is paid for** (`redactScan`: evidence stubs keep
   id/kind/source/confidence only).
3. Views progress: `onboarding → searching → paywall → report`. A locked scan opened at
   `/report` falls back to the paywall view.
4. **Paywall** (TeaChecker-style clean checkout page: `pw-*` classes, white/sans/lime, no
   neobrutalist borders or serif): results header → green "Posts found" box (number +
   segmented green→red bar, dimmed to neutral at 0 mentions) → horizontal blurred locked cards
   (from server-redacted stubs) →
   black "50% discount expires in MM:SS" countdown (decorative session timer — no Stripe promo
   configured) → offer card (Full report checks, lime per-day price tag, weekly $9.99/wk vs
   monthly $17.99/mo "BEST VALUE" = $0.60/day toggle, auto-renew disclaimers) → Apple Pay /
   Link marks + "Or pay with card" + card brands → black "Pay & Get Report →" CTA. CTA POSTs
   `/api/scans/{id}/checkout` → Stripe Checkout subscription session ($9.99/wk,
   $17.99/mo prices) → hosted Stripe page (where Apple Pay/Link/card actually run).
   Success/cancel return to
   `/report?scan_id=&access_token=&checkout=success|cancelled&session_id={CHECKOUT_SESSION_ID}`;
   the client polls `/api/scans/{id}/entitlement` (DB grant, or direct Stripe session verify)
   every 3 s up to ~2 min, cleans the URL, then swaps to the report.
5. **Report view** (also mounted at `/report`, same component with `initialView="report"`):
   sidebar (profile card, Posts/Profiles nav counts, alerts placeholder that says "not
   configured", recent checks — clicking one refetches that scan), main sections **Posts** and
   **Profiles**, evidence detail modal (confidence %, reasons, comments, flags, "Mark as not
   me" dismiss/restore), "Import Tea evidence" modal (manual import of material you lawfully
   possess), and Refresh buttons that re-run OpenRouter post/profile discovery. While the Tea
   source is queued/running (analyst review), the report polls every 5 s and shows "GOOD NEWS:
   We haven't found you on the Tea app".
6. `/review` — password-token analyst workspace for the Tea queue (see Providers below).

Report access = session cookie **or** `?scan_id=&access_token=`; only the token's SHA-256 hash
is stored (unique index). Homepage `/` is pure static marketing.

## Stack

- Next.js 16 App Router + React 19 + TypeScript, Tailwind CSS v4. Node ≥ 22.13.
- Storage: **Vercel Postgres** via the `postgres` package (migrated off Cloudflare D1 in
  commit 030b501) and **Vercel Blob** (`@vercel/blob`, private access) for photos/screenshots.
- `lib/database.ts` wraps postgres.js in a **D1-style API** (`prepare().bind().run/all/first`,
  `batch`; a `positionalSql` shim converts `?` → `$n`). Write SQL with `?` placeholders.
  Schema lives there as one string and is applied **idempotently on first API request**
  (`ensureSchema`, memoized per process) together with compatibility ALTERs/backfills;
  `db/migrations/*.sql` are historical (D1 era).
- Env vars (`.env.example`): `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` (required);
  `STRIPE_SECRET_KEY`, `STRIPE_PRICE_WEEKLY`, `STRIPE_PRICE_MONTHLY`,
  `STRIPE_WEBHOOK_SECRET` (+ reserved `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) for the paywall;
  `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (default `deepseek/deepseek-v4-flash-0731`)/
  `OPENROUTER_SEARCH_ENGINE` (parallel|exa); `TEA_AUTHORIZED_ENDPOINT`/`TEA_AUTHORIZED_TOKEN`;
  `FACE_CHECK_API_TOKEN` + `FACE_CHECK_TESTING_MODE`; `ANALYST_REVIEW_TOKEN`.
- Verify with `npm run lint` && `npm run build`. **There are no tests.**

## Key files

- `lib/backend-types.ts` — shared types. Sources: `'Tea' | 'Face search' | 'Public web'`;
  evidence kinds: `tea_post | face_match | profile_match | web_page | manual_import`;
  statuses: `queued | running | complete | unconfigured | failed`.
- `lib/stripe.ts` — lazy Stripe SDK wrapper, price-id↔plan mapping, config checks.
- `lib/providers.ts` — the whole pipeline. Three providers run concurrently:
  - **Tea**: credential-gated adapter posting a self-search payload to
    `TEA_AUTHORIZED_ENDPOINT`. Without credentials → status `queued` → scan lands in the
    analyst queue at `/review` (bearer `ANALYST_REVIEW_TOKEN`, constant-time compare in
    `lib/review-auth.ts`); analyst submits found/uncertain/not_found + optional screenshot,
    written straight into the customer report.
  - **Face search**: FaceCheck.id upload-and-poll (55 s budget). Skipped without photo or
    without explicit consent; separate source from Tea; keeps provider similarity score.
  - **Public web**: two sub-passes through one OpenRouter chat-completions call each using the
    `openrouter:web_search` tool (see below) — posts (Reddit pass + TikTok/IG/Threads/FB pass)
    and direct profile pages (dating apps first). Only URL-cited results are retained; identity
    confidence is recomputed locally from visible name/age/location/username signals; subject-owned
    accounts, non-social URLs, news/entertainment content, and profile-vs-post duplicates are filtered out.
  - `persistResult` batches inserts (75/batch) and rolls back evidence+blobs on failure;
    `refreshPostDiscovery`/`refreshProfileDiscovery` replace prior generated evidence of their kind.
- `lib/session.ts` — anonymous `gc_session` HttpOnly cookie; SHA-256(token) is the session id.
- `lib/database.ts` — schema, wrapper, `sessionIdForReportAccess`, `getScans`/`hydrateScans`.
- `app/check/check-flow.tsx` — entire funnel/paywall/report UI (~530 lines).
- `app/api/**` — scans CRUD/run/photo/posts/profiles, evidence PATCH + asset GET, review queue,
  `scans/[id]/checkout` + `scans/[id]/entitlement` (poll/verify) + `webhooks/stripe`. Evidence
  content is redacted in scan responses until the scan's `entitlement_status = 'active'`;
  refresh/import/dismiss/asset endpoints additionally 403 for locked scans. Asset/photo GETs
  enforce ownership: session cookie or matching access-token hash.

## What's real vs marketing

**Real**: scan/report persistence; provider runs and cited public-web discovery when keys are
set; FaceCheck integration with consent gating; analyst review queue; manual evidence import;
dismiss/restore persisted server-side; hashed access-token links; private blob ownership checks;
cached reports (reopening a completed scan does not rerun paid searches); empty states never
invent matches; **the paywall** — Stripe Checkout subscriptions ($9.99/wk / $17.99/mo), signed
idempotent webhook grants, server-side evidence redaction until paid, entitlement expiry on
subscription cancellation.

**Marketing/decorative (do not present as functional)**: homepage hero sample numbers ("86
match"), "Monitoring is on", step 4 "Live coverage / Tea is active in your area", step 10
testimonials (Marcus T., James R., …) and "Thousands of private self-searches completed", the
paywall's "Alerts when new mentions appear" promise (alerts card openly says delivery isn't
configured), the paywall's "50% discount expires in MM:SS" countdown (cosmetic session timer;
no Stripe promotion/coupon is configured — back it with a real promo or remove before launch),
and the "● encrypted" window label.

## Risks / gotchas

- **Payments**: unlock requires a paid entitlement (`scans.entitlement_status`); evidence is
  redacted server-side before payment, so the network response no longer leaks the report.
  Webhook (`/api/webhooks/stripe`) is signed + idempotent via the `stripe_events` table; the
  entitlement poll endpoint double-checks `{CHECKOUT_SESSION_ID}` with Stripe as a fallback
  while the webhook is in flight (it verifies the session's `client_reference_id`/metadata
  matches the scan). Residual: no refund/dispute handling (disputes don't revoke access), no
  dunning UI beyond Stripe's own emails, and cancellation expiry relies on
  `customer.subscription.deleted`.
- **Sensitive domain** (dating-gossip lookup of named individuals). Code-level guardrails to
  preserve: mandatory `selfSearchConfirmed` (403 otherwise), ages 18–99, explicit face-search
  consent, third-party-posts-only filtering, subject-owned-account exclusion, namesake
  disclaimers throughout, no fabricated results. Don't weaken these.
- `POST /api/scans/[id]/run` runs providers inline (OpenRouter aborts at 120 s, FaceCheck polls
  ≤55 s) — serverless timeout risk; long-running work should eventually move to async jobs.
- No rate limiting/auth beyond the anonymous cookie; provider calls cost real money per scan.
- Losing the session cookie loses report access unless the `access_token` link was saved
  (only its hash is stored — the raw token is shown exactly once).
- Legacy Cloudflare remnants (`wrangler`/vite plugins in devDeps, `.openai/hosting.json`
  naming D1/R2, `db/migrations/0001_core.sql`) predate the Vercel migration — don't treat them
  as live infra.
- Keep README.md accurate alongside this file when behavior changes.

## Crew rules

Multiple ox-alpha workers share this repo (current branch: `grokbot`; PRs target `main`).
All workers: start sessions in `/workspace/gossipcheck` so this file loads; read CLAUDE.md and
`.claude/shared-memory.md` before working; **update both after any change that affects the
brief** (routes, flow, stack, pricing, env vars, risks); do not commit or push unless the task
says so.
