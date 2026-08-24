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
- The Tea adapter accepts both a generic `{ results: [...] }` response and native Tea-shaped `posts`/`items` records. GossipCheck recalculates identity confidence from visible name, age, location, username, and explicit face-match signals instead of trusting a provider's opaque score. Embedded comments, flags, counts, provider IDs, and post metadata are retained.
- Set `FACE_CHECK_API_TOKEN` to enable FaceCheck's official upload-and-poll API. A scan is created first, its optional photo is saved, and providers run only afterward. The photo is sent only after explicit consent. FaceCheck results stay in a separate source from Tea results and retain the provider similarity score.
- Set `BRAVE_SEARCH_API_KEY` to enable the public-web provider.
- When no authorized Tea connector is configured, scans enter the private analyst queue at [http://localhost:3000/review](http://localhost:3000/review). Set `ANALYST_REVIEW_TOKEN`, open the queue with that token, review the supplied identifiers/photo using an account and process you are authorized to use, then submit found, uncertain, or not-found. The customer report polls and updates automatically.
- Without provider credentials, sources clearly report that they are unconfigured or queued. Users can import Tea evidence they lawfully possess. Real searches never generate fake matches.
- D1 caches each completed report, provider run state, normalized provider records, and supplied comments. Reopening a completed report does not rerun paid searches.

Copy `.env.example` to `.env.local` to configure optional providers and the analyst token. The provider adapter contract is implemented in `lib/providers.ts`.

## Verification

```bash
npm run lint
npm run build
```

The canonical database migration is `db/migrations/0001_core.sql`. Local development also initializes the same schema idempotently on the first API request.
