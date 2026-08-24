'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ScanRecord, SourceName } from '../../lib/backend-types';

type View = 'form' | 'scanning' | 'results';
type Filter = 'All' | SourceName;

const stepLabels = [
  ['Your details', 'Name, city, age'],
  ['Public profiles', 'Usernames you use'],
  ['Review & scan', 'Confirm it’s your search'],
];

export default function CheckFlow() {
  const [view, setView] = useState<View>('form');
  const [step, setStep] = useState(1);
  const [scanStage, setScanStage] = useState(0);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [sourceFilter, setSourceFilter] = useState<Filter>('All');
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', age: '', city: '', teaName: '', instagram: '', reddit: '' });

  useEffect(() => {
    fetch('/api/scans').then(async (response) => {
      const data = await response.json() as { scans?: ScanRecord[] };
      if (response.ok && data.scans) setHistory(data.scans);
    }).catch(() => undefined);
  }, []);

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
    window.setTimeout(() => setScanStage(1), 450);
    window.setTimeout(() => setScanStage(2), 900);

    try {
      const response = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          age: Number(profile.age),
          city: profile.city,
          usernames: [profile.teaName, profile.instagram, profile.reddit].filter(Boolean),
          selfSearchConfirmed: confirmed,
        }),
      });
      const data = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'The check could not be completed.');
      setScan(data.scan);
      setHistory((current) => [data.scan!, ...current.filter((item) => item.id !== data.scan!.id)]);
      setView('results');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The check could not be completed.');
      setView('form');
      setStep(3);
    }
  };

  const importEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scan) return;
    setImporting(true);
    setError('');
    const form = event.currentTarget;
    try {
      const response = await fetch(`/api/scans/${scan.id}/evidence`, { method: 'POST', body: new FormData(form) });
      const data = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'The evidence could not be saved.');
      setScan(data.scan);
      setHistory((current) => current.map((item) => item.id === data.scan!.id ? data.scan! : item));
      setImportOpen(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The evidence could not be saved.');
    } finally {
      setImporting(false);
    }
  };

  const toggleDismissed = async (evidenceId: string, dismissed: boolean) => {
    if (!scan) return;
    const update = (item: ScanRecord) => ({ ...item, evidence: item.evidence.map((evidence) => evidence.id === evidenceId ? { ...evidence, dismissed } : evidence) });
    setScan(update(scan));
    try {
      const response = await fetch(`/api/evidence/${evidenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed }),
      });
      if (!response.ok) throw new Error();
      setHistory((current) => current.map((item) => item.id === scan.id ? update(item) : item));
    } catch {
      setScan(scan);
      setError('The evidence state could not be updated.');
    }
  };

  const visibleEvidence = useMemo(() => {
    if (!scan) return [];
    return scan.evidence.filter((item) => sourceFilter === 'All' || item.source === sourceFilter);
  }, [scan, sourceFilter]);

  const reset = () => {
    setView('form');
    setStep(1);
    setScanStage(0);
    setScan(null);
    setConfirmed(false);
    setSourceFilter('All');
    setImportOpen(false);
    setError('');
  };

  const openHistory = (item: ScanRecord) => {
    setScan(item);
    setView('results');
    setSourceFilter('All');
    setError('');
  };

  return (
    <main className="check-page">
      <header className="check-header">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/" aria-label="GossipCheck home">
          <span className="brand-mark" aria-hidden="true"><span className="bubble bubble-back" /><span className="bubble bubble-front">✓</span></span>
          <span>gossipcheck</span><b>.app</b>
        </a>
        <div className="check-security"><span>●</span> Private local session</div>
      </header>

      {view === 'form' && (
        <>
          <section className="check-shell">
            <aside className="check-sidebar">
              <span className="section-number">NEW CHECK</span>
              <h1>Let’s look for <em>you.</em></h1>
              <p>Run a Tea-first self-search, keep every check, and collect evidence in one private report.</p>
              <ol className="check-steps">
                {stepLabels.map(([title, detail], index) => (
                  <li className={step === index + 1 ? 'active' : step > index + 1 ? 'complete' : ''} key={title}>
                    <b>{step > index + 1 ? '✓' : index + 1}</b><span>{title}<small>{detail}</small></span>
                  </li>
                ))}
              </ol>
            </aside>

            <form className="check-card" onSubmit={runCheck}>
              <div className="tea-focus">
                <span className="tea-mark">T</span>
                <div><b>Tea-first scan</b><small>Authorized connector + evidence import</small></div>
                <span className="focus-pill">Priority</span>
              </div>
              <span className="section-number">STEP {step} OF 3</span>

              {step === 1 && (
                <div className="form-step">
                  <h2>What should we search?</h2><p className="check-lede">Use the details people would most likely include in a post about you.</p>
                  <div className="field-grid">
                    <label>First name<input value={profile.firstName} onChange={(event) => updateProfile('firstName', event.target.value)} type="text" placeholder="Alex" autoComplete="given-name" /></label>
                    <label>Age<input value={profile.age} onChange={(event) => updateProfile('age', event.target.value)} type="number" min="18" max="99" placeholder="29" /></label>
                    <label className="wide">City or area<input value={profile.city} onChange={(event) => updateProfile('city', event.target.value)} type="text" placeholder="Brooklyn, New York" autoComplete="address-level2" /></label>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="form-step">
                  <h2>Add names you use online.</h2><p className="check-lede">Optional identity signals help separate you from people with the same name.</p>
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
                  <h2>Ready for your check?</h2><p className="check-lede">The scan and its source status will be saved to this local browser session.</p>
                  <div className="profile-review">
                    <div><span>Name</span><b>{profile.firstName}, {profile.age}</b></div>
                    <div><span>Area</span><b>{profile.city}</b></div>
                    <div><span>Usernames</span><b>{[profile.teaName, profile.instagram, profile.reddit].filter(Boolean).join(' · ') || 'None added'}</b></div>
                    <div><span>Sources</span><b>Tea · Public web</b></div>
                  </div>
                  <label className="self-confirm">
                    <input checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setError(''); }} type="checkbox" />
                    <span><b>I’m searching for myself.</b><small>I will only upload evidence I am allowed to possess and process.</small></span>
                  </label>
                </div>
              )}

              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="check-actions">
                {step > 1 ? <button className="back-button" type="button" onClick={() => { setStep((current) => current - 1); setError(''); }}>← Back</button> : <span>Nothing is searched until you confirm.</span>}
                {step < 3 ? <button type="button" onClick={goForward}>Continue <span aria-hidden="true">→</span></button> : <button type="submit">Run private check <span aria-hidden="true">→</span></button>}
              </div>
            </form>
          </section>

          {history.length > 0 && (
            <section className="history-shell">
              <div><span className="section-number">YOUR LOCAL HISTORY</span><h2>Previous checks.</h2></div>
              <div className="history-list">
                {history.map((item) => <button type="button" onClick={() => openHistory(item)} key={item.id}><span><b>{item.profile.firstName}, {item.profile.age}</b><small>{item.profile.city}</small></span><strong>{item.evidence.length} evidence</strong><i>→</i></button>)}
              </div>
            </section>
          )}
        </>
      )}

      {view === 'scanning' && (
        <section className="scanning-shell" aria-live="polite">
          <div className="scanner-visual" aria-hidden="true"><span className="scanner-ring ring-a" /><span className="scanner-ring ring-b" /><span className="scanner-core">GC</span></div>
          <span className="section-number">CHECK IN PROGRESS</span><h1>Checking possible mentions<br />for <em>{profile.firstName}</em>.</h1><p>Only configured providers and your private evidence store are used.</p>
          <div className="scan-progress">
            {['Creating private scan record', 'Running source connectors', 'Saving your report'].map((label, index) => <div className={scanStage > index ? 'done' : scanStage === index ? 'active' : ''} key={label}><span>{scanStage > index ? '✓' : index + 1}</span><b>{label}</b><small>{scanStage > index ? 'Complete' : scanStage === index ? 'Working…' : 'Waiting'}</small></div>)}
          </div>
        </section>
      )}

      {view === 'results' && scan && (
        <section className="results-shell">
          <div className="live-banner"><b>Saved report</b><span>Scan {scan.id.slice(0, 8)} · data belongs to this private local session</span></div>
          <div className="results-heading">
            <div><span className="section-number">CHECK {scan.status.toUpperCase()}</span><h1>{scan.evidence.length ? <>Found <em>{scan.evidence.length} evidence item{scan.evidence.length === 1 ? '' : 's'}.</em></> : <>No evidence <em>collected yet.</em></>}</h1><p>For {scan.profile.firstName}, {scan.profile.age} · {scan.profile.city}</p></div>
            <button type="button" onClick={reset}>Start a new check</button>
          </div>

          <div className="source-summary">
            {scan.sources.map((source) => (
              <article className={source.name === 'Tea' ? 'tea-source' : ''} key={source.id}>
                <div><span className="source-badge">{source.name === 'Tea' ? 'T' : 'W'}</span><b>{source.name}</b></div>
                <strong>{source.matches}</strong><span>{source.matches === 1 ? 'item' : 'items'}</span>
                <small><i className={`status-dot ${source.status}`} />{source.note}</small>
              </article>
            ))}
          </div>

          <div className="tea-import-panel">
            <div><span className="tea-mark">T</span><div><b>Add Tea evidence you already have</b><small>Upload a screenshot and the relevant post details. The image stays private behind your session cookie.</small></div></div>
            <button type="button" onClick={() => setImportOpen((current) => !current)}>{importOpen ? 'Close' : '+ Import Tea evidence'}</button>
            {importOpen && (
              <form className="evidence-form" onSubmit={importEvidence}>
                <label>Short title<input name="title" required maxLength={160} placeholder="Tea post mentioning Alex in Brooklyn" /></label>
                <label>Relevant post text<textarea name="excerpt" required maxLength={1200} rows={4} placeholder="Paste only the portion needed for your report…" /></label>
                <div><label>Source link (optional)<input name="sourceUrl" type="url" placeholder="https://…" /></label><label>Date seen (optional)<input name="capturedAt" type="date" /></label></div>
                <label>Screenshot (optional, private)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
                <p>JPG, PNG, or WebP · 8 MB maximum. Do not upload private content without permission.</p>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button type="submit" disabled={importing}>{importing ? 'Saving…' : 'Save evidence'}</button>
              </form>
            )}
          </div>

          <div className="results-toolbar">
            <div>{(['All', 'Tea', 'Public web'] as const).map((filter) => <button className={sourceFilter === filter ? 'active' : ''} type="button" onClick={() => setSourceFilter(filter)} key={filter}>{filter}</button>)}</div>
            <span>{visibleEvidence.length} shown · {scan.evidence.filter((item) => item.dismissed).length} dismissed</span>
          </div>

          <div className="match-list">
            {visibleEvidence.length === 0 && <div className="empty-evidence"><b>No {sourceFilter === 'All' ? '' : `${sourceFilter} `}evidence in this report.</b><span>Configure a source connector or import Tea evidence above. GossipCheck never fills an empty report with fake matches.</span></div>}
            {visibleEvidence.map((item) => (
              <article className={`result-card ${item.dismissed ? 'dismissed' : ''}`} key={item.id}>
                <div className="result-source"><span className={item.source === 'Tea' ? 'tea-result-mark' : ''}>{item.source === 'Tea' ? 'T' : 'W'}</span><div><b>{item.source}</b><small>{item.reasons.includes('Imported by you') ? 'Imported by you' : 'Provider result'}</small></div></div>
                <div className="result-content">
                  <div className="result-labels"><span className={`confidence ${item.confidence >= 75 ? 'likely' : 'possible'}`}>{item.confidence}% · {item.confidence >= 75 ? 'strong' : 'possible'} signal</span><span>{item.capturedAt.slice(0, 10)}</span></div>
                  <h2>{item.title}</h2><blockquote>{item.excerpt}</blockquote>
                  {item.imageUrl && <a className="evidence-image" href={item.imageUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="User-imported evidence screenshot" />
                  </a>}
                  <div className="reason-row">{item.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div>
                </div>
                <div className="result-actions">
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a> : <button type="button" disabled>No source link</button>}
                  <button type="button" onClick={() => toggleDismissed(item.id, !item.dismissed)}>{item.dismissed ? 'Restore evidence' : 'Not me'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
