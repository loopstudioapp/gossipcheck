# GossipCheck live-walk gaps — 2026-08-26 17:20 ICT

Walked http://127.0.0.1:3000/check as Alex / 29 / Austin, TX. 11/11 onboarding steps present in brief order, then search, then paywall. CTA clicked once.

## Blocker (not a code invent)
- Stripe keys are not in env (no `.env` / `.env.local`). CTA → "Payments are not configured for this deployment yet." HTTP 503 from `/api/scans/{id}/checkout`. Do not invent keys. Keep iterating UI/flow.

## Paywall skin — WRONG vs TeaChecker brief / `.claude/paywall-redo.md`
Founder already rejected cream/neobrutalist. Live paywall is still that look:
- cream `#f5efe6` page, serif headings, chunky black offset borders
- NOT white / clean sans / lots of whitespace / 8–12px radius light borders

Keep the structure that already works. Change the skin.

### Already present (do not rebuild, restyle)
- Top bar: `gossipcheck.app` + black "Get the report" pill
- "Results for {name}." + "Near {city} • Age {age}"
- Green "Posts found" box, big number (0 on this walk); bar correctly dims to gray at 0 mentions
- "Potential posts found" + horizontal blurred locked cards (tag chips + black Locked pills)
- "Unlock your full report"
- Black "50% discount expires in MM:SS" countdown (decorative)
- Offer: Full report + 3 checks; lime per-day; $9.99/wk vs $17.99/mo BEST VALUE (monthly preselected, $0.60/day)
- Apple Pay (black) / Link (lime) marks, "Or pay with card", Visa/MC/Amex/Discover
- Black "Pay & Get Report →"
- Stripe safe-checkout line + renewal disclaimer
- Honest stats chips, "What people are saying", lime "100% Anonymous & Private"

### Target tokens
- Background white
- Primary lime ~#99ff66 (price tag, Link, highlights)
- Near-black / dark navy headlines, sans-serif
- Black pills, large tap targets
- Cards: 8–12px radius, light borders, no chunky offset shadows
- Brand stays GossipCheck. No Tea / TeaChecker / teapot.

## Onboarding notes (lower priority)
- FaceCheck consent checkbox does not render when no photo is chosen. Fine if it appears once a photo is added; must stay required to enable face search.
- No extra "are you searching for yourself?" screen appeared (may be implicit in the create-scan payload). Do not weaken the server `selfSearchConfirmed` guard.
- Step 4 "Tea is active in your area" / LIVE COVERAGE is marketing-only — keep it labeled as such, do not present as a live connector.
- Viewport-locked 11-step funnel is solid. Do not restyle the whole onboarding in this pass unless the paywall change forces a shared token update. Paywall first.

## Do not
- Do not invent Stripe keys
- Do not fabricate preview posts
- Do not scrape teachecker.app `/report?payment_intent=` or other people's reports
- Do not commit `.claude/refs/` TeaChecker paid-report captures
- Do not commit or push unless asked (GitHub auth is missing in this environment)
- Do not touch `/workspace/mosso clone` or `/workspace/cat shooting game`
