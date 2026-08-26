# GossipCheck

A Tea-focused self-search app. It creates persistent scan reports, runs configured source providers, and lets the owner import Tea evidence with private screenshot storage.

The `/check` experience follows a complete 11-step onboarding funnel (identity, search area, education, optional username and photo) before opening a report dashboard with source counts, evidence cards, detail views, nearby public results, photo-search status, and a scan summary. The structure is informed by TeaChecker's public funnel and report, but GossipCheck does not copy its branding, personal report data, fabricated preview posts, or unverified marketing claims.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, configure `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`, then open [http://localhost:3000/check](http://localhost:3000/check). Completed scans open at `http://localhost:3000/report?scan_id=...&access_token=...`; the unguessable access token lets an emailed report link work in another browser while the database stores only its SHA-256 hash. Visiting [http://localhost:3000/report](http://localhost:3000/report) without an ID loads the latest report owned by the current private session. A report stays locked behind the paywall until it is paid for (see Payments below).

## Backend

- PostgreSQL stores anonymous sessions, profiles, scans, source-run status, and evidence metadata. The schema is initialized idempotently on the first API request.
- A private Vercel Blob store holds evidence screenshots. Images are only returned when the request owns the matching session cookie or presents the report access token.
- Optional onboarding reference photos use the same private Blob store and ownership checks.
- The Tea adapter is deliberately credential-gated. Set `TEA_AUTHORIZED_ENDPOINT` and `TEA_AUTHORIZED_TOKEN` only for a source you are contractually and technically allowed to query.
- The Tea adapter accepts both a generic `{ results: [...] }` response and native Tea-shaped `posts`/`items` records. GossipCheck recalculates identity confidence from visible name, age, location, username, and explicit face-match signals instead of trusting a provider's opaque score. Embedded comments, flags, counts, provider IDs, and post metadata are retained.
- Set `FACE_CHECK_API_TOKEN` to enable FaceCheck's official upload-and-poll API. A scan is created first, its optional photo is saved, and providers run only afterward. The photo is sent only after explicit consent. FaceCheck results stay in a separate source from Tea results and retain the provider similarity score.
- Set `OPENROUTER_API_KEY` to enable AI-assisted public-mention discovery. The provider uses `deepseek/deepseek-v4-flash-0731` by default with OpenRouter's `openrouter:web_search` server tool (Exa engine), retains only URL-cited results, and recalculates identity confidence locally. Override the model with `OPENROUTER_MODEL`.
- When no authorized Tea connector is configured, scans enter the private analyst queue at [http://localhost:3000/review](http://localhost:3000/review). Set `ANALYST_REVIEW_TOKEN`, open the queue with that token, review the supplied identifiers/photo using an account and process you are authorized to use, then submit found, uncertain, or not-found. The customer report polls and updates automatically.
- Without provider credentials, sources clearly report that they are unconfigured or queued. Users can import Tea evidence they lawfully possess. Real searches never generate fake matches.
- PostgreSQL caches each completed report, provider run state, normalized provider records, and supplied comments. Reopening a completed report does not rerun paid searches.

## Payments

Reports unlock only after payment through Stripe Checkout:

- Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_WEEKLY`, and `STRIPE_PRICE_MONTHLY` to enable checkout. The weekly plan is $9.99/week and the monthly plan is $17.99/month; both are recurring Stripe subscriptions. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is reserved for future embedded components.
- While a scan has no active entitlement, every API response redacts evidence server-side — paywall tiles receive ids, kinds, and confidence but no titles, text, links, images, or comments. Refresh/import/dismiss endpoints return 403 until the report is unlocked.
- `POST /api/scans/{id}/checkout` creates a subscription Checkout Session for the chosen price and redirects the customer to Stripe. Scan id, plan, and report-access token travel in session metadata and the success URL.
- `POST /api/webhooks/stripe` verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`, claims each event id exactly once in a `stripe_events` table for idempotency, grants the entitlement on `checkout.session.completed`, and expires it on `customer.subscription.deleted`.
- After redirecting back, the client polls `GET /api/scans/{id}/entitlement`. Besides checking the database grant, it can verify the returned `{CHECKOUT_SESSION_ID}` directly with Stripe so customers do not wait on webhook delivery.
- Canceling the subscription in Stripe expires the entitlement and returns the report to the paywall.

Copy `.env.example` to `.env.local` to configure optional providers and the analyst token. The provider adapter contract is implemented in `lib/providers.ts`.

## Verification

```bash
npm run lint
npm run build
```

The production schema and compatibility migrations live in `lib/database.ts` and run idempotently on the first API request. The original D1 migration remains in `db/migrations/0001_core.sql` for historical/local export compatibility.
