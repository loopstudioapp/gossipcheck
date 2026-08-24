const sources = ['Tea preview', 'Reddit', 'Public web', 'YouTube', 'X'];

const CheckIcon = () => <span className="check-icon" aria-hidden="true">✓</span>;

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
          <h1>Know what’s public <em>about you.</em></h1>
          <p className="hero-lede">
            Find public posts that may mention your name or usernames. Every match
            comes with the source, context, and a clear confidence score.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="/check">
              Run a private scan <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#report">See a sample report <span aria-hidden="true">↓</span></a>
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
        {sources.map((source) => <span className="source-name" key={source}>{source}</span>)}
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
          <p>Demo only — no information is submitted from this design.</p>
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
