type BrandIcon = { hex: string; path: string };

const siReddit: BrandIcon = { hex: 'FF4500', path: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z' };
const siYoutube: BrandIcon = { hex: 'FF0000', path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' };
const siX: BrandIcon = { hex: '000000', path: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z' };
const siFacebook: BrandIcon = { hex: '0866FF', path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z' };
const siInstagram: BrandIcon = { hex: 'FF0069', path: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077' };

type Source = {
  label: string;
  icon: BrandIcon | 'tea' | 'web';
};

const sources: Source[] = [
  { label: 'Tea', icon: 'tea' },
  { label: 'Reddit', icon: siReddit },
  { label: 'Public web', icon: 'web' },
  { label: 'YouTube', icon: siYoutube },
  { label: 'X', icon: siX },
  { label: 'Facebook', icon: siFacebook },
  { label: 'Instagram', icon: siInstagram },
];

function SourceLogo({ source }: { source: Source }) {
  if (source.icon === 'tea') {
    return <span className="source-logo source-logo-tea" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7h12v5.5A5.5 5.5 0 0 1 11.5 18h-1A5.5 5.5 0 0 1 5 12.5V7Z" /><path d="M17 9h1.25a2.75 2.75 0 0 1 0 5.5H17" /><path d="M8 4.5c0 1 1 1.15 1 2.15M12 4.5c0 1 1 1.15 1 2.15" /></svg></span>;
  }
  if (source.icon === 'web') {
    return <span className="source-logo source-logo-web" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.25 2.25 3.35 5.08 3.35 8.5S14.25 18.25 12 20.5M12 3.5C9.75 5.75 8.65 8.58 8.65 12s1.1 6.25 3.35 8.5" /></svg></span>;
  }
  return <span className="source-logo" aria-hidden="true" style={{ color: `#${source.icon.hex}` }}><svg viewBox="0 0 24 24"><path d={source.icon.path} /></svg></span>;
}

const CheckIcon = () => <span className="check-icon" aria-hidden="true">✓</span>;

const faqs = [
  {
    question: 'What platforms do you search?',
    answer: 'We scan publicly available posts on dating review platforms and social media sites like Facebook, Twitter/X, and others where people share experiences and warnings about those they’ve dated.',
  },
  {
    question: 'How does Gossip Checker work?',
    answer: 'We scan publicly available content using your name, location, and other details to find if anyone has posted about you. Our AI matches profiles even with nicknames or variations.',
  },
  {
    question: 'Do you also find social media posts?',
    answer: 'Yes! Beyond dating apps, we scan public social media posts on Facebook, Twitter/X, and other platforms for mentions that may be about you based on your profile details.',
  },
  {
    question: 'Is my search confidential?',
    answer: '100% confidential. We don’t store your personal information, and your search is completely private. No one will know you checked.',
  },
  {
    question: 'What information do I need to search?',
    answer: 'Just your first name (or nickname), age, and the city/area where you’ve dated. Photos are optional but increase accuracy.',
  },
  {
    question: 'How accurate are the results?',
    answer: 'Our AI-powered matching achieves 94% accuracy. We use advanced algorithms to match names, locations, and physical descriptions across all platforms.',
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="GossipCheck home">
          <span className="brand-mark" aria-hidden="true">
            <span className="bubble bubble-back" />
            <span className="bubble bubble-front">✓</span>
          </span>
          <span>gossipcheck</span><b>.app</b>
        </a>

        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#report">Sample report</a>
          <a className="nav-cta" href="/check">Check my name</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Private reputation check</div>
          <h1>Know what they say <em>about you.</em></h1>
          <p className="hero-lede">
            Find public posts that may mention your name or usernames. Every match
            comes with the source, context, and a clear confidence score.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="/check">
              Check now <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="/check">Get your report in 3 min <span aria-hidden="true">→</span></a>
          </div>

          <div className="trust-row" aria-label="Product assurances">
            <span><CheckIcon /> Self-search only</span>
            <span><CheckIcon /> Sources included</span>
            <span><CheckIcon /> Delete anytime</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Illustration of a GossipCheck report">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="report-window">
            <div className="window-bar">
              <span className="window-dots"><i /><i /><i /></span>
              <span>private report</span>
              <span className="lock">● encrypted</span>
            </div>
            <div className="report-body">
              <div className="report-heading">
                <div>
                  <span className="mini-label">GossipCheck summary</span>
                  <h2>Your public mentions</h2>
                </div>
                <div className="score-ring"><b>86</b><span>match</span></div>
              </div>

              <div className="signal-strip">
                <div><strong>4</strong><span>possible matches</span></div>
                <div><strong>3</strong><span>sources checked</span></div>
                <div><strong>2</strong><span>new this month</span></div>
              </div>

              <article className="mention-card">
                <div className="source-avatar">r/</div>
                <div className="mention-content">
                  <div className="mention-meta"><b>Reddit</b><span>2 days ago</span></div>
                  <p>“Has anyone else met Alex from Brooklyn? We matched last week…”</p>
                  <div className="match-reasons">
                    <span>Same name</span><span>Same city</span><span>Username match</span>
                  </div>
                </div>
                <span className="likely">Likely</span>
              </article>

              <div className="report-footer">
                <span><i /> Monitoring is on</span>
                <button type="button" aria-label="View sample report details">View evidence →</button>
              </div>
            </div>
          </div>
          <div className="floating-note note-one"><span>✓</span> Source verified</div>
          <div className="floating-note note-two"><b>+2</b> new mentions</div>
        </div>
      </section>

      <section className="source-band" aria-label="Supported sources">
        <span className="source-title">CURRENTLY CHECKING</span>
        {sources.map((source) => <span className="source-name" key={source.label}><SourceLogo source={source} /><span>{source.label}</span></span>)}
        <span className="source-more">More sources as access becomes available</span>
      </section>

      <section className="explanation" id="how">
        <div className="section-intro">
          <span className="section-number">01 / HOW IT WORKS</span>
          <h2>Less guessing.<br /><em>More evidence.</em></h2>
          <p>We show why something matched, so you decide whether it’s really about you.</p>
        </div>

        <div className="steps">
          <article>
            <span className="step-icon">01</span>
            <h3>Tell us what to check</h3>
            <p>Add your name, city, and public usernames. A photo is always optional.</p>
          </article>
          <article>
            <span className="step-icon">02</span>
            <h3>We scan public sources</h3>
            <p>GossipCheck checks supported public sources without notifying anyone.</p>
          </article>
          <article>
            <span className="step-icon">03</span>
            <h3>Review every match</h3>
            <p>See the evidence, confidence level, original link, and mark false matches.</p>
          </article>
        </div>
      </section>

      <section className="sample-section" id="report">
        <div className="sample-card">
          <div className="sample-copy">
            <span className="section-number">02 / YOUR REPORT</span>
            <h2>A clear answer,<br />with <em>receipts.</em></h2>
            <p>Not a scary black box. Your report separates strong matches from weak ones and links back to every available source.</p>
            <ul>
              <li><CheckIcon /> Plain-language overview</li>
              <li><CheckIcon /> Confidence reasons for every result</li>
              <li><CheckIcon /> Simple “not me” and deletion controls</li>
            </ul>
          </div>

          <div className="evidence-stack" aria-label="Example evidence cards">
            <article className="evidence-card evidence-back">
              <span>PUBLIC WEB</span><b>Possible match</b>
            </article>
            <article className="evidence-card evidence-front">
              <div className="evidence-top"><span>RESULT #04</span><b>LIKELY MATCH</b></div>
              <div className="redacted-lines"><i /><i /><i /><i /></div>
              <div className="evidence-stats">
                <span><small>CONFIDENCE</small><b>86%</b></span>
                <span><small>SOURCE</small><b>Reddit</b></span>
                <span><small>CAPTURED</small><b>Today</b></span>
              </div>
              <button type="button">Open original source ↗</button>
            </article>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="faq-kicker"><span>FAQ</span><i /></div>
        <h2>Ask us <em>anything.</em></h2>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}<span aria-hidden="true" /></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="scan-section" id="scan">
        <div>
          <span className="section-number light">PRIVATE BY DEFAULT</span>
          <h2>Check your name.<br /><em>Keep your peace.</em></h2>
        </div>
        <div className="scan-form">
          <label htmlFor="name">First name or username</label>
          <div>
            <input id="name" type="text" placeholder="e.g. Alex or @alexr" />
            <a href="/check">Start my check <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <footer>
        <a className="brand brand-footer" href="#top">
          <span className="brand-mark small" aria-hidden="true"><span className="bubble bubble-back" /><span className="bubble bubble-front">✓</span></span>
          <span>gossipcheck</span><b>.app</b>
        </a>
        <p>Public information, presented responsibly.</p>
        <div><a href="#top">Privacy</a><a href="#top">Terms</a><a href="mailto:hello@gossipcheck.app">Contact</a></div>
      </footer>
    </main>
  );
}
