# REDO the paywall — match real TeaChecker

The founder rejected the current neobrutalist cream/lime GossipCheck paywall. They pasted the REAL teachecker.app paywall (4 mobile screens). Redo the UI to match that, pixel-close. Do not invent a third style.

## Keep
- Brand: GossipCheck / gossipcheck.app (NOT Tea, NOT TeaChecker, no teapot logo)
- Prices: **$9.99/week** and **$17.99/month BEST VALUE** (founder's prices). You may frame them per-day like TeaChecker does ($1.43/day, $0.60/day).
- Real Stripe checkout path already in `lib/stripe.ts` and `POST /api/scans/[id]/checkout`. Do not fake-unlock.
- Same funnel: locked scan shows this paywall (`app/check/check-flow.tsx`).

## Match this layout (from founder's 4 screens)

### Screen 1 — results + locked posts + offer
- White mobile page, clean sans-serif, lots of whitespace, rounded corners. NOT neobrutalist, no hard black shadows, no cream phone-card, no serif headline.
- Top bar: small logo left + brand wordmark. Right: black pill **Get the report**.
- Headline: **Results for {firstName}.**
- Sub: Near {city} • Age {age}
- Green rounded box: **Tea Posts Found** analog → **Posts found** (or "Mentions found") with a big number. Segmented green→red bar. Tooltip like "N posts mentioning you."
- Section **Potential posts found**
- Horizontal row of **blurred** post cards. Each card has a black pill **Locked** with a lock icon. Tags on cards (e.g. Heartbreak / Review style chips) when evidence exists.
- **Unlock your full report** with a lock icon
- Black banner: clock + **50% discount expires in MM:SS** (countdown)
- Offer card: **Full report** + checkmarks: Full post content, Comments, Alerts for new posts
- Right side lime price tag: **$X.XX per day** (from selected plan). Strike the higher list price if you show one.

### Screen 2 — pay methods
- Two big buttons: **Apple Pay** (black) and **Link** (lime, with arrow). Side by side.
- Divider: **Or pay with card**
- Stripe-style card form: Card number, Expiry, CVC, Country. "Secure, fast checkout with Link". Card brand marks.
- Legal: By providing your card information, you allow GossipCheck to charge your card for future payments in accordance with their terms.

### Screen 3 — pay CTA + trust
- Big black pill: **Pay & Get Report →**
- Lock + **Guaranteed safe & secure checkout by Stripe.**
- Disclaimer: first-period price, then renews at the selected plan until canceled. Cancel anytime. Terms + Privacy.
- Card brand icons
- **Trusted by …** stats row (use honest/placeholder product stats, do not fake TeaChecker's 50k if we do not have it — or label as example)
- Testimonials **What people are saying** (cream/yellow cards, 5 stars, name + initial). Rewrite so they are GossipCheck, not copied TeaChecker quotes verbatim.

### Screen 4 — more proof + privacy
- More testimonial cards
- Green pill **100% Anonymous & Private**
- Your search is confidential. We never share or notify anyone.
- Questions? support email if one exists, else omit.

## Visual tokens (approx)
- Background: white
- Primary lime: ~#99FF66 for price tag, Link button, highlights
- Text: near-black / dark navy headlines
- Buttons: black pills, large tap targets
- Cards: 8–12px radius, light borders, no chunky offset shadows

## Do not
- Do not keep the current cream/neobrutalist paywall-shell.
- Do not use Tea / TeaChecker / teapot branding.
- Do not decompile or scrape other people's paid reports.
- Do not commit unless asked.

Reference PNGs already on disk (older scrape, same product):
- `.claude/refs/teachecker-report.png`
- `.claude/refs/teachecker-report-empty.png`

When done, the locked-scan `/report?scan_id=…` and post-search `/check` paywall must look like those TeaChecker screens. Write what changed into `.claude/shared-memory.md`.
