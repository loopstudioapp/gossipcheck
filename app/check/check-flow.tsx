'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { CheckResponse } from '../../lib/check-engine';

type View = 'form' | 'scanning' | 'results';

const stepLabels = [
  ['Your details', 'Name, city, age'],
  ['Public profiles', 'Usernames you use'],
  ['Review & scan', 'Confirm it’s your search'],
];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function CheckFlow() {
  const [view, setView] = useState<View>('form');
  const [step, setStep] = useState(1);
  const [scanStage, setScanStage] = useState(0);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'All' | 'Tea' | 'Public web'>('All');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [profile, setProfile] = useState({
    firstName: '',
    age: '',
    city: '',
    teaName: '',
    instagram: '',
    reddit: '',
  });

  const updateProfile = (field: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const goForward = () => {
    if (step === 1) {
      const age = Number(profile.age);
      if (!profile.firstName.trim() || !profile.city.trim() || !Number.isInteger(age) || age < 18 || age > 99) {
        setError('Enter your first name, city, and an age between 18 and 99.');
        return;
      }
    }
    setError('');
    setStep((current) => Math.min(3, current + 1));
  };

  const runCheck = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) {
      setError('Confirm that you are searching for yourself.');
      return;
    }

    setError('');
    setView('scanning');
    setScanStage(0);
    window.setTimeout(() => setScanStage(1), 650);
    window.setTimeout(() => setScanStage(2), 1350);

    try {
      const [response] = await Promise.all([
        fetch('/api/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: profile.firstName,
            age: Number(profile.age),
            city: profile.city,
            usernames: [profile.teaName, profile.instagram, profile.reddit].filter(Boolean),
            selfSearchConfirmed: confirmed,
          }),
        }),
        wait(2200),
      ]);

      const data = await response.json() as CheckResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'The demo check could not be completed.');
      setResult(data);
      setView('results');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The demo check could not be completed.');
      setView('form');
      setStep(3);
    }
  };

  const visibleMatches = useMemo(() => {
    if (!result) return [];
    return result.matches.filter((match) => sourceFilter === 'All' || match.source === sourceFilter);
  }, [result, sourceFilter]);

  const reset = () => {
    setView('form');
    setStep(1);
    setScanStage(0);
    setResult(null);
    setConfirmed(false);
    setDismissed([]);
    setSourceFilter('All');
  };

  return (
    <main className="check-page">
      <header className="check-header">
        <a className="brand" href="/" aria-label="GossipCheck home">
          <span className="brand-mark" aria-hidden="true">
            <span className="bubble bubble-back" />
            <span className="bubble bubble-front">✓</span>
          </span>
          <span>gossipcheck</span><b>.app</b>
        </a>
        <div className="check-security"><span>●</span> Private demo session</div>
      </header>

      {view === 'form' && (
        <section className="check-shell">
          <aside className="check-sidebar">
            <span className="section-number">NEW CHECK</span>
            <h1>Let’s look for <em>you.</em></h1>
            <p>We’ll start with a Tea workflow preview, then compare supported public sources for stronger matches.</p>
            <ol className="check-steps">
              {stepLabels.map(([title, detail], index) => (
                <li className={step === index + 1 ? 'active' : step > index + 1 ? 'complete' : ''} key={title}>
                  <b>{step > index + 1 ? '✓' : index + 1}</b>
                  <span>{title}<small>{detail}</small></span>
                </li>
              ))}
            </ol>
          </aside>

          <form className="check-card" onSubmit={runCheck}>
            <div className="tea-focus">
              <span className="tea-mark">T</span>
              <div><b>Tea-first scan</b><small>Connector preview · no live Tea data is accessed</small></div>
              <span className="focus-pill">Priority</span>
            </div>

            <span className="section-number">STEP {step} OF 3</span>

            {step === 1 && (
              <div className="form-step">
                <h2>What should we search?</h2>
                <p className="check-lede">Use the details people would most likely include in a post about you.</p>
                <div className="field-grid">
                  <label>First name<input value={profile.firstName} onChange={(event) => updateProfile('firstName', event.target.value)} type="text" placeholder="Alex" autoComplete="given-name" /></label>
                  <label>Age<input value={profile.age} onChange={(event) => updateProfile('age', event.target.value)} type="number" min="18" max="99" placeholder="29" /></label>
                  <label className="wide">City or area<input value={profile.city} onChange={(event) => updateProfile('city', event.target.value)} type="text" placeholder="Brooklyn, New York" autoComplete="address-level2" /></label>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="form-step">
                <h2>Add names you use online.</h2>
                <p className="check-lede">These are optional, but they help separate you from people with the same name.</p>
                <div className="field-grid single">
                  <label>Tea display name<input value={profile.teaName} onChange={(event) => updateProfile('teaName', event.target.value)} type="text" placeholder="Alex R." /></label>
                  <label>Instagram username<input value={profile.instagram} onChange={(event) => updateProfile('instagram', event.target.value)} type="text" placeholder="@alex.r" /></label>
                  <label>Reddit username<input value={profile.reddit} onChange={(event) => updateProfile('reddit', event.target.value)} type="text" placeholder="u/alexr" /></label>
                </div>
                <div className="privacy-note"><b>Privacy note</b><span>GossipCheck does not publish or notify these profiles.</span></div>
              </div>
            )}

            {step === 3 && (
              <div className="form-step">
                <h2>Ready for your check?</h2>
                <p className="check-lede">Review what the demo will use. You can go back and edit anything.</p>
                <div className="profile-review">
                  <div><span>Name</span><b>{profile.firstName}, {profile.age}</b></div>
                  <div><span>Area</span><b>{profile.city}</b></div>
                  <div><span>Usernames</span><b>{[profile.teaName, profile.instagram, profile.reddit].filter(Boolean).join(' · ') || 'None added'}</b></div>
                  <div><span>Priority</span><b>Tea workflow preview</b></div>
                </div>
                <label className="self-confirm">
                  <input checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setError(''); }} type="checkbox" />
                  <span><b>I’m searching for myself.</b><small>I understand this version returns generated demonstration data, not live Tea results.</small></span>
                </label>
              </div>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="check-actions">
              {step > 1 ? <button className="back-button" type="button" onClick={() => { setStep((current) => current - 1); setError(''); }}>← Back</button> : <span>Nothing is searched until you confirm.</span>}
              {step < 3
                ? <button type="button" onClick={goForward}>Continue <span aria-hidden="true">→</span></button>
                : <button type="submit">Run demo check <span aria-hidden="true">→</span></button>}
            </div>
          </form>
        </section>
      )}

      {view === 'scanning' && (
        <section className="scanning-shell" aria-live="polite">
          <div className="scanner-visual" aria-hidden="true">
            <span className="scanner-ring ring-a" /><span className="scanner-ring ring-b" />
            <span className="scanner-core">GC</span>
          </div>
          <span className="section-number">DEMO CHECK IN PROGRESS</span>
          <h1>Checking possible mentions<br />for <em>{profile.firstName}</em>.</h1>
          <p>No live Tea account or private content is being accessed.</p>
          <div className="scan-progress">
            {['Preparing Tea connector preview', 'Comparing identity signals', 'Building your sample report'].map((label, index) => (
              <div className={scanStage > index ? 'done' : scanStage === index ? 'active' : ''} key={label}>
                <span>{scanStage > index ? '✓' : index + 1}</span><b>{label}</b><small>{scanStage > index ? 'Complete' : scanStage === index ? 'Working…' : 'Waiting'}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === 'results' && result && (
        <section className="results-shell">
          <div className="demo-banner"><b>Demo report</b><span>{result.disclaimer}</span></div>
          <div className="results-heading">
            <div>
              <span className="section-number">CHECK COMPLETE</span>
              <h1>We found <em>{result.matches.length} sample candidates.</em></h1>
              <p>For {result.profile.firstName}, {result.profile.age} · {result.profile.city}</p>
            </div>
            <button type="button" onClick={reset}>Start a new check</button>
          </div>

          <div className="source-summary">
            {result.sources.map((source) => (
              <article className={source.name === 'Tea' ? 'tea-source' : ''} key={source.name}>
                <div><span className="source-badge">{source.name === 'Tea' ? 'T' : source.name.charAt(0)}</span><b>{source.name}</b></div>
                <strong>{source.matches}</strong>
                <span>{source.matches === 1 ? 'candidate' : 'candidates'}</span>
                <small>{source.note}</small>
              </article>
            ))}
          </div>

          <div className="results-toolbar">
            <div>
              {(['All', 'Tea', 'Public web'] as const).map((filter) => (
                <button className={sourceFilter === filter ? 'active' : ''} type="button" onClick={() => setSourceFilter(filter)} key={filter}>{filter}</button>
              ))}
            </div>
            <span>{visibleMatches.length} shown · {dismissed.length} dismissed</span>
          </div>

          <div className="match-list">
            {visibleMatches.map((match) => {
              const isDismissed = dismissed.includes(match.id);
              return (
                <article className={`result-card ${isDismissed ? 'dismissed' : ''}`} key={match.id}>
                  <div className="result-source">
                    <span className={match.source === 'Tea' ? 'tea-result-mark' : ''}>{match.source === 'Tea' ? 'T' : 'W'}</span>
                    <div><b>{match.source}</b><small>Generated demo result</small></div>
                  </div>
                  <div className="result-content">
                    <div className="result-labels"><span className={`confidence ${match.label}`}>{match.confidence}% · {match.label} match</span><span>DEMO DATA</span></div>
                    <h2>{match.headline}</h2>
                    <blockquote>{match.excerpt}</blockquote>
                    <div className="reason-row">{match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div>
                    {match.source === 'Tea' && <p className="access-note"><b>Tea access:</b> Live post text, images, and source links stay unavailable until an authorized connector or licensing agreement is in place.</p>}
                  </div>
                  <div className="result-actions">
                    <button type="button" disabled>Open source ↗</button>
                    <button type="button" onClick={() => setDismissed((current) => isDismissed ? current.filter((id) => id !== match.id) : [...current, match.id])}>{isDismissed ? 'Restore match' : 'Not me'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
