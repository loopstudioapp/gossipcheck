# GossipCheck shared memory (crew file)

> **RULE: All workers read and update both this file and `/workspace/gossipcheck/CLAUDE.md`.**
> Start every session with cwd `/workspace/gossipcheck` so CLAUDE.md auto-loads. After any
> change that affects the brief (routes, flow, stack, pricing, env vars, risks), update BOTH
> files in the same edit pass. Do not commit or push unless your task explicitly says so.
> Shared branch: `grokbot`. PR target: `main`.

This file mirrors the product brief in CLAUDE.md so it survives even when a session starts
outside the repo root or skips the auto-load.

## Product brief

**GossipCheck** (`gossipcheck.app`) is a self-search reputation checker for adults (18–99) who
date on apps: enter your own first name, age, city, optional Instagram username, and optional
photo; get a persistent private report of public posts, dating/social profiles, and
face-search candidates that might refer to you — each with source link, date, locally-computed
identity-confidence score, and reasons. Inspired by the Tea app's funnel/report but no copied
branding, data, fabricated preview posts, or unverifiable marketing claims. Matches are leads
to verify, never proof.

### Main flow
- `/check` → one client component `app/check/check-flow.tsx`.
  1. **11-step viewport-locked onboarding**: name → age → city (Google Maps confirm) →
     coverage marketing → stakes → experiences (never sent to providers) → spread timeline →
     how-it-works → optional Instagram → testimonials → optional photo + explicit FaceCheck
     consent checkbox.
  2. POST `/api/scans` (profile + scan + 3 source_runs + unguessable access token stored as
     SHA-256 hash) → optional photo upload → POST `/api/scans/{id}/run` runs all providers
     **synchronously**. Scan responses are redacted server-side until paid (`redactScan`:
     evidence stubs keep id/kind/source/confidence only).
  3. Views: `onboarding → searching → paywall → report`; a locked scan at `/report` falls back
     to the paywall view.
  4. **Paywall** (TeaChecker-style clean checkout page, `pw-*` classes in `app/globals.css`;
     white/sans/lime #99ff66, no neobrutalist borders/shadows/serif; `body:has(.pw-page)`
     forces the document canvas white so the cream body background never bleeds in): top bar
     (brand + black
     "Get the report" pill) → "Results for {name}." → green **Posts found** box (big number +
     segmented green→red bar; dims to neutral gray at 0 mentions) → horizontal **blurred locked
     cards** (tag chip + black Locked
     pill, built from server-redacted evidence stubs) → "Unlock your full report" → black
     **50%-discount countdown banner** (decorative session timer, 09:59 → 0, hides once
     expired; no Stripe promo is actually configured) → offer card (Full report checks + lime
     per-day price tag
     $1.43/day or $0.60/day + weekly $9.99/wk vs monthly $17.99/mo BEST VALUE toggle) →
     Apple Pay (black) / Link (lime) marks, "Or pay with card" divider, card-brand marks →
     black **Pay & Get Report →** CTA (real Stripe Checkout via `/api/scans/{id}/checkout`)
     → "Guaranteed safe & secure checkout by Stripe" + renewal disclaimers → honest stats
     chips → "What people are saying" cream testimonials → "100% Anonymous & Private" pill.
     CTA POSTs `/api/scans/{id}/checkout` → Stripe hosted page (Apple Pay/Link/card live
     there) → client polls `/api/scans/{id}/entitlement` after redirect (DB grant or direct
     Stripe session verify) → report unlocks.
  5. **Report** (same component at `/report`, `initialView="report"`): sidebar profile/nav/
     alerts-placeholder/history (recent-check clicks refetch the scan); **Posts** and
     **Profiles** sections; detail modal with confidence/reasons/comments/flags and "Mark as
     not me"; Import Tea evidence modal; refresh buttons re-run OpenRouter discovery. Polls 5 s
     while Tea review is pending ("GOOD NEWS: We haven't found you on the Tea app").
- `/review`: token-gated analyst queue for Tea checks when no authorized connector is set.
- Report access = anonymous session cookie OR scan_id+access_token link.

### Stack
Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Node ≥22.13 · Vercel Postgres
(`postgres` pkg wrapped in a D1-style prepare/bind/run/batch API in `lib/database.ts`; queries
use `?` placeholders, converted to `$n`) · Vercel Blob private store for photos/screenshots ·
schema applied idempotently on first API request (`ensureSchema`) · verify via
`npm run lint && npm run build` (**no test suite**).

Env (see `.env.example`): `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`;
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_WEEKLY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_WEBHOOK_SECRET`
(+ reserved `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) for the Stripe paywall; optional
`OPENROUTER_API_KEY` (+`OPENROUTER_MODEL` default `deepseek/deepseek-v4-flash-0731`,
`OPENROUTER_SEARCH_ENGINE` parallel|exa), `TEA_AUTHORIZED_ENDPOINT/_TOKEN`,
`FACE_CHECK_API_TOKEN` (+`FACE_CHECK_TESTING_MODE`), `ANALYST_REVIEW_TOKEN`.

### Key files
- `lib/backend-types.ts` — sources `Tea | Face search | Public web`; kinds
  `tea_post | face_match | profile_match | web_page | manual_import`.
- `lib/providers.ts` — pipeline: credential-gated Tea adapter (else analyst queue);
  FaceCheck.id upload+poll, consent-gated, kept separate from Tea; Public web = OpenRouter
  chat-completions with `openrouter:web_search` tool, two post passes (Reddit / other socials)
  + one profile pass (dating apps first); URL-cited results only, local identity-confidence
  scoring, namesake/media/subject-owned filtering; batched persistence with rollback;
  `refreshPostDiscovery`/`refreshProfileDiscovery` replace generated evidence per kind.
- `lib/session.ts` anonymous `gc_session` cookie; `lib/stripe.ts` Stripe SDK + price↔plan map;
  `lib/review-auth.ts` constant-time bearer compare; `app/page.tsx` static marketing homepage;
  API routes under `app/api/**` enforce ownership via session cookie or hashed access token on
  asset/photo GETs, redact evidence until the scan's entitlement is active, and 403 locked
  scans on refresh/import/dismiss/asset routes. New routes: `scans/[id]/checkout`,
  `scans/[id]/entitlement`, `webhooks/stripe` (signed, idempotent via `stripe_events`).

### Real vs marketing
Real: report persistence, provider runs + cited public-web discovery when configured,
consent-gated FaceCheck, analyst queue, manual imports, persisted dismiss/restore, hashed
token links, private blob ownership checks, cached completed scans, empty states never fake
matches, and the paywall (Stripe Checkout subscriptions $9.99/wk / $17.99/mo, signed
idempotent webhook grants, server-side evidence redaction until paid, expiry on subscription
cancellation). Marketing-only: hero sample numbers, "Monitoring is on", step-4 live-coverage
card, step-10 testimonials/"thousands of searches", the paywall's alerts promise and its
"50% discount expires in MM:SS" countdown (no Stripe promotion is configured — cosmetic
urgency timer only), and the "encrypted" label.

### Risks / gotchas
- Payments: evidence is withheld server-side until `scans.entitlement_status = 'active'`;
  webhook grants are signed + idempotent (`stripe_events`), and the poll endpoint verifies
  `{CHECKOUT_SESSION_ID}` with Stripe as fallback. Residual: no refund/dispute revocation, no
  custom dunning UI.
- Sensitive domain: keep guardrails (mandatory self-search confirmation → 403, ages 18–99,
  explicit face consent, third-party-posts-only, subject-account exclusion, namesake caveats).
- Inline provider execution (≤120 s OpenRouter abort, ≤55 s FaceCheck poll) — timeout risk.
- No rate limiting; provider calls cost money; losing the cookie loses access without the
  saved token link (hash-only storage, shown once).
- Cloudflare remnants (wrangler devDeps, `.openai/hosting.json`, `db/migrations/`) are dead
  history since the Vercel migration (commit 030b501) — don't treat as live infra.
- Keep README.md and CLAUDE.md accurate when behavior changes.
