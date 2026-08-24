# GossipCheck

A local-first, Tea-focused self-search app. It creates persistent scan reports, runs configured source providers, and lets the owner import Tea evidence with private screenshot storage.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000/check](http://localhost:3000/check). Vinext/Miniflare provides local D1 and R2 storage under `.wrangler/`.

## Backend

- D1 stores anonymous sessions, profiles, scans, source-run status, and evidence metadata.
- R2 stores evidence screenshots. Images are only returned when the request owns the matching session cookie.
- The Tea adapter is deliberately credential-gated. Set `TEA_AUTHORIZED_ENDPOINT` and `TEA_AUTHORIZED_TOKEN` only for a source you are contractually and technically allowed to query.
- Set `BRAVE_SEARCH_API_KEY` to enable the public-web provider.
- Without provider credentials, scans still persist and clearly report the source as unconfigured; users can import Tea evidence they lawfully possess. No fake matches are generated.

Copy `.env.example` to `.env.local` to configure optional providers. The provider adapter contract is implemented in `lib/providers.ts`.

## Verification

```bash
npm run lint
npm run build
```

The canonical database migration is `db/migrations/0001_core.sql`. Local development also initializes the same schema idempotently on the first API request.
