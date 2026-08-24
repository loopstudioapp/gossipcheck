# GossipCheck

A local-first, Tea-focused self-search app. It creates persistent scan reports, runs configured source providers, and lets the owner import Tea evidence with private screenshot storage.

The `/check` experience follows a complete 11-step onboarding funnel (identity, search area, education, optional username and photo) before opening a report dashboard with source counts, evidence cards, detail views, nearby public results, photo-search status, and a scan summary. The structure is informed by TeaChecker's public funnel and report, but GossipCheck does not copy its branding, personal report data, fabricated preview posts, or unverified marketing claims.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000/check](http://localhost:3000/check) for onboarding. Completed scans open at `http://localhost:3000/report?scan_id=...&access_token=...`; the unguessable access token lets an emailed report link work in another browser while the database stores only its SHA-256 hash. Visiting [http://localhost:3000/report](http://localhost:3000/report) without an ID loads the latest report owned by the current private session. Vinext/Miniflare provides local D1 and R2 storage under `.wrangler/`.

## Backend

- D1 stores anonymous sessions, profiles, scans, source-run status, and evidence metadata.
- R2 stores evidence screenshots. Images are only returned when the request owns the matching session cookie.
- Optional onboarding reference photos are also stored in R2 and protected by the same session ownership check.
- The Tea adapter is deliberately credential-gated. Set `TEA_AUTHORIZED_ENDPOINT` and `TEA_AUTHORIZED_TOKEN` only for a source you are contractually and technically allowed to query.
- Set `BRAVE_SEARCH_API_KEY` to enable the public-web provider.
- When no authorized Tea connector is configured, scans enter the private analyst queue at [http://localhost:3000/review](http://localhost:3000/review). Set `ANALYST_REVIEW_TOKEN`, open the queue with that token, review the supplied identifiers/photo using an account and process you are authorized to use, then submit found, uncertain, or not-found. The customer report polls and updates automatically.
- Without provider credentials, public-web scans clearly report that source as unconfigured. Users can import Tea evidence they lawfully possess. Real searches never generate fake matches.

Copy `.env.example` to `.env.local` to configure optional providers and the analyst token. The provider adapter contract is implemented in `lib/providers.ts`.

## Verification

```bash
npm run lint
npm run build
```

The canonical database migration is `db/migrations/0001_core.sql`. Local development also initializes the same schema idempotently on the first API request.
