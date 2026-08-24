'use client';

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { EvidenceRecord, ScanRecord, SourceName } from '../../lib/backend-types';

type AppView = 'onboarding' | 'searching' | 'report';
type Filter = 'All' | SourceName;

const totalSteps = 11;
const experiences = [
  ['😶', 'A date suddenly went cold'],
  ['👻', 'Someone stopped replying without context'],
  ['👀', 'Friends seemed to know something you did not'],
  ['📱', 'The tone changed after a phone check'],
  ['🤷', 'Interested matches never responded'],
];

const sourceStatusLabel = (status: string) => status === 'complete' ? 'Checked' : status === 'queued' || status === 'running' ? 'In review' : status === 'unconfigured' ? 'Needs setup' : status;
const evidenceLabel = (item: EvidenceRecord) => item.reasons.includes('Imported by you') ? 'Imported' : item.confidence >= 85 ? 'Strong match' : 'Potential match';
const withAccessToken = (scan: ScanRecord, accessToken: string) => !accessToken ? scan : ({
  ...scan,
  profile: { ...scan.profile, photoUrl: scan.profile.photoUrl ? `${scan.profile.photoUrl}?access_token=${encodeURIComponent(accessToken)}` : null },
  evidence: scan.evidence.map((item) => ({ ...item, imageUrl: item.imageUrl ? `${item.imageUrl}?access_token=${encodeURIComponent(accessToken)}` : null })),
});

export default function CheckFlow({ initialView = 'onboarding' }: { initialView?: AppView }) {
  const [view, setView] = useState<AppView>(initialView);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [scanStage, setScanStage] = useState(0);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [profile, setProfile] = useState({ firstName: '', age: '', city: '', instagram: '', experiences: [] as string[], photo: null as File | null });

  useEffect(() => {
    fetch('/api/scans').then(async (response) => {
      const data = await response.json() as { scans?: ScanRecord[] };
      if (response.ok && data.scans) {
        let scans = data.scans;
        if (initialView === 'report') {
          const url = new URL(window.location.href);
          const requestedId = url.searchParams.get('scan_id');
          const accessToken = url.searchParams.get('access_token') || '';
          let selected = requestedId ? scans.find((item) => item.id === requestedId) || null : scans[0] || null;
          if (!selected && requestedId && accessToken) {
            const reportResponse = await fetch(`/api/scans/${encodeURIComponent(requestedId)}?access_token=${encodeURIComponent(accessToken)}`);
            const reportData = await reportResponse.json() as { scan?: ScanRecord };
            if (reportResponse.ok && reportData.scan) {
              selected = withAccessToken(reportData.scan, accessToken);
              scans = [selected];
            }
          }
          setScan(selected);
        }
        setHistory(scans);
      }
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
  }, [initialView]);

  const update = <K extends keyof typeof profile>(key: K, value: typeof profile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const next = () => {
    if (step === 1 && !profile.firstName.trim()) return setError('Enter the name or nickname you use while dating.');
    if (step === 2 && (!Number.isInteger(Number(profile.age)) || Number(profile.age) < 18 || Number(profile.age) > 99)) return setError('Enter an age between 18 and 99.');
    if (step === 3 && !profile.city.trim()) return setError('Enter the city or area where you date.');
    setError('');
    if (step < totalSteps) setStep((current) => current + 1);
    else void runSearch();
  };

  const runSearch = async () => {
    setView('searching');
    setScanStage(0);
    const stageTimers = [650, 1300, 1950].map((delay, index) => window.setTimeout(() => setScanStage(index + 1), delay));
    try {
      const started = Date.now();
      const response = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          age: Number(profile.age),
          city: profile.city,
          usernames: profile.instagram ? [profile.instagram] : [],
          selfSearchConfirmed: true,
        }),
      });
      const data = await response.json() as { scan?: ScanRecord; accessToken?: string; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'The check could not be completed.');
      let completedScan = data.scan;

      if (profile.photo) {
        const form = new FormData();
        form.set('photo', profile.photo);
        const photoResponse = await fetch(`/api/scans/${completedScan.id}/photo`, { method: 'POST', body: form });
        const photoData = await photoResponse.json() as { scan?: ScanRecord; error?: string };
        if (!photoResponse.ok || !photoData.scan) throw new Error(photoData.error || 'The photo could not be saved.');
        completedScan = photoData.scan;
      }

      const remaining = Math.max(0, 2400 - (Date.now() - started));
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
      const reportUrl = new URL('/report', window.location.origin);
      reportUrl.searchParams.set('scan_id', completedScan.id);
      if (data.accessToken) reportUrl.searchParams.set('access_token', data.accessToken);
      window.location.assign(`${reportUrl.pathname}${reportUrl.search}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The check could not be completed.');
      setView('onboarding');
      setStep(11);
    } finally {
      stageTimers.forEach(window.clearTimeout);
    }
  };

  const importEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scan) return;
    setImporting(true);
    setError('');
    const form = event.currentTarget;
    try {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      const response = await fetch(`/api/scans/${scan.id}/evidence${query}`, { method: 'POST', body: new FormData(form) });
      const data = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'The evidence could not be saved.');
      const updatedScan = withAccessToken(data.scan, accessToken);
      setScan(updatedScan);
      setHistory((current) => current.map((item) => item.id === updatedScan.id ? updatedScan : item));
      setImportOpen(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The evidence could not be saved.');
    } finally {
      setImporting(false);
    }
  };

  const toggleDismissed = async (item: EvidenceRecord) => {
    if (!scan) return;
    const dismissed = !item.dismissed;
    const previous = scan;
    const updated = { ...scan, evidence: scan.evidence.map((evidence) => evidence.id === item.id ? { ...evidence, dismissed } : evidence) };
    setScan(updated);
    setSelectedEvidence((current) => current?.id === item.id ? { ...current, dismissed } : current);
    try {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      const response = await fetch(`/api/evidence/${item.id}${query}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismissed }),
      });
      if (!response.ok) throw new Error();
      setHistory((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch {
      setScan(previous);
      setError('The evidence state could not be updated.');
    }
  };

  const startOver = () => {
    window.location.assign('/check');
  };

  const visibleEvidence = useMemo(() => scan?.evidence.filter((item) => filter === 'All' || item.source === filter) || [], [scan, filter]);
  const teaEvidence = scan?.evidence.filter((item) => item.source === 'Tea') || [];
  const publicEvidence = scan?.evidence.filter((item) => item.source === 'Public web') || [];
  const teaSource = scan?.sources.find((source) => source.name === 'Tea');
  const teaReviewPending = teaSource?.status === 'queued' || teaSource?.status === 'running';
  const teaSourceIssue = teaSource?.status === 'failed' || teaSource?.status === 'unconfigured';
  const pendingScanId = teaReviewPending ? scan?.id : null;

  useEffect(() => {
    if (!pendingScanId) return;
    const timer = window.setInterval(() => {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      fetch(`/api/scans/${pendingScanId}${query}`).then(async (response) => {
        const data = await response.json() as { scan?: ScanRecord };
        if (!response.ok || !data.scan) return;
        const refreshed = withAccessToken(data.scan, accessToken);
        setScan(refreshed);
        setHistory((current) => current.map((item) => item.id === refreshed.id ? refreshed : item));
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pendingScanId]);

  if (view === 'onboarding') return (
    <main className="funnel-page">
      <header className="funnel-header">
        <button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : history[0] ? window.location.assign(`/report?scan_id=${encodeURIComponent(history[0].id)}`) : window.history.back()} aria-label="Back">←</button>
        <BrandLink />
        <div><b>{String(step).padStart(2, '0')}</b><span>/{totalSteps}</span></div>
      </header>
      <div className="funnel-progress"><i style={{ width: `${step / totalSteps * 100}%` }} /></div>
      <div className="funnel-status"><span>Step {step}</span><span>● Private local session</span></div>

      <section className="funnel-main">
        {step === 1 && <FunnelStep icon="👋" title="What’s your first name?" subtitle="Or the name or nickname you use on dating apps."><input autoFocus value={profile.firstName} onChange={(event) => update('firstName', event.target.value)} placeholder="Enter your first name" /><Tip>We will compare common variations without publishing your search.</Tip></FunnelStep>}
        {step === 2 && <FunnelStep icon="🎂" title="How old are you?" subtitle="Age helps separate people who share the same name."><input autoFocus value={profile.age} onChange={(event) => update('age', event.target.value)} type="number" min="18" max="99" placeholder="Your age" /><Tip>GossipCheck only supports self-searches by adults.</Tip></FunnelStep>}
        {step === 3 && <FunnelStep icon="📍" title="Where do you date?" subtitle="The city or area where you have been active on dating apps."><input autoFocus value={profile.city} onChange={(event) => update('city', event.target.value)} placeholder="Search for a city or area…" /><div className="funnel-map"><span>◎</span><b>{profile.city || 'Your search area'}</b><small>Location is used only to rank possible matches.</small></div></FunnelStep>}
        {step === 4 && <FunnelStep icon="📡" title={`Source coverage near ${profile.city || 'you'}`} subtitle="Here is what GossipCheck can check before your report begins."><InfoGrid items={[["T", "Tea provider", "Authorized connector or your imports"], ["W", "Public web", "Available with a search API key"], ["↻", "Saved monitoring", "Every scan remains in local history"]]} /><Tip>We show unconfigured sources honestly instead of inventing matches.</Tip></FunnelStep>}
        {step === 5 && <FunnelStep icon="👀" title="Know what may be shaping first impressions." subtitle="Public posts and screenshots can circulate without reaching the person they mention."><InfoGrid items={[["?", "Missing context", "Names alone can produce false positives"], ["⌁", "Screenshots travel", "Copies may outlive the original post"], ["✓", "Evidence matters", "Review the source before drawing conclusions"]]} /><Tip>A match is a lead to review, never proof that a claim is true.</Tip></FunnelStep>}
        {step === 6 && <FunnelStep icon="🤔" title="Has this ever happened to you?" subtitle="Select any experiences that resonate. This is optional and is not sent to source providers."><div className="choice-list">{experiences.map(([icon, label]) => <button className={profile.experiences.includes(label) ? 'selected' : ''} type="button" key={label} onClick={() => update('experiences', profile.experiences.includes(label) ? profile.experiences.filter((item) => item !== label) : [...profile.experiences, label])}><span>{icon}</span>{label}<i>{profile.experiences.includes(label) ? '✓' : '+'}</i></button>)}</div><Tip>You cannot control what is posted, but you can document and review what you find.</Tip></FunnelStep>}
        {step === 7 && <FunnelStep icon="↗" title="One post can create many copies." subtitle="A report helps you separate the original source from screenshots and reposts."><div className="spread-line">{[["01", "Original post", "Capture its source and date"], ["02", "Comments", "Preserve relevant context"], ["03", "Reposts", "Track duplicates separately"], ["04", "Your report", "Keep verified evidence together"]].map(([number, title, copy]) => <div key={number}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></div>)}</div></FunnelStep>}
        {step === 8 && <FunnelStep icon="🛡️" title="Found something concerning? Build an evidence trail." subtitle="GossipCheck helps organize material for review; it does not promise removal or provide legal advice."><InfoGrid items={[["1", "Collect", "Save the source, date, and screenshot"], ["2", "Verify", "Rule out namesakes and missing context"], ["3", "Respond", "Use the platform’s official reporting process"]]} /><div className="truth-card"><b>Built for careful review</b><span>Private files, ownership checks, source links, and persistent dismiss/restore controls.</span></div></FunnelStep>}
        {step === 9 && <FunnelStep icon="◎" title="What’s your Instagram? (optional)" subtitle="A public username can strengthen identity matching."><div className="handle-input"><span>@</span><input value={profile.instagram.replace(/^@/, '')} onChange={(event) => update('instagram', event.target.value.replace(/^@/, ''))} placeholder="yourusername" /></div><Tip>Skip this if you prefer. GossipCheck never contacts or notifies the account.</Tip></FunnelStep>}
        {step === 10 && <FunnelStep icon="✓" title="What your private report includes" subtitle="Every result stays tied to its source and collection status."><div className="report-preview-list">{['Tea evidence and authorized-provider results', 'Public-web candidates when configured', 'Private screenshots and source links', 'Match confidence and the signals behind it', 'Saved history with dismiss and restore controls'].map((item) => <p key={item}><span>✓</span>{item}</p>)}</div><Tip>Your report never fills an empty search with fake posts.</Tip></FunnelStep>}
        {step === 11 && <FunnelStep icon="☺" title="Add a photo (optional)" subtitle="Keep a private reference photo with this scan for future authorized image matching."><label className="photo-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => update('photo', event.target.files?.[0] || null)} /><span>{profile.photo ? '✓' : '＋'}</span><b>{profile.photo?.name || 'Click to choose a photo'}</b><small>JPG, PNG, or WebP · up to 8 MB</small></label><Tip>The file is stored privately and is never sent unless an authorized image provider is configured.</Tip></FunnelStep>}
        {error && <p className="funnel-error" role="alert">{error}</p>}
      </section>

      <footer className="funnel-footer">
        <button type="button" onClick={next}>{step === totalSteps ? 'Search sources' : 'Next'} <span>{step === totalSteps ? '⌕' : '→'}</span></button>
        <p>{step === totalSteps ? 'Your persistent report will be created now' : 'Nothing is shared with the people you search for'}</p>
      </footer>
    </main>
  );

  if (view === 'searching') return (
    <main className="searching-page">
      <BrandLink />
      <section>
        <div className="search-orbit"><i /><i /><span>⌕</span></div>
        <h1>Searching for {profile.firstName}</h1>
        <p>Age {profile.age} · Near {profile.city}</p>
        <div className="search-meter"><i style={{ width: `${Math.min(100, (scanStage + 1) * 25)}%` }} /></div>
        <strong>{['Creating your private report…', 'Checking Tea access…', 'Checking public sources…', 'Saving source status…'][scanStage]}</strong>
        <div className="search-facts"><span>● No fake preview posts</span><span>● Source status saved</span><span>● Owner-only files</span></div>
      </section>
    </main>
  );

  if (!scan) return historyLoaded ? <NoReport /> : <ReportLoading />;
  return (
    <main className="report-page">
      <aside className="report-sidebar">
        <BrandLink />
        <section className="monitor-card">
          <span>● Monitoring profile</span>
          <div className="profile-row">
            {scan.profile.photoUrl ? <img src={scan.profile.photoUrl} alt="Private profile reference" /> : <i>{scan.profile.firstName.charAt(0).toUpperCase()}</i>}
            <div><h2>{scan.profile.firstName}</h2><p>{scan.profile.age} years old</p></div>
          </div>
          <b>⌖ {scan.profile.city}</b>
        </section>
        <section className="report-nav-card">
          <h3>Results</h3>
          <button className={filter === 'Tea' ? 'active tea' : ''} onClick={() => setFilter(filter === 'Tea' ? 'All' : 'Tea')} type="button"><span><b>Tea evidence</b><small>Matching this search</small></span><i>{teaEvidence.length}</i></button>
          <button className={filter === 'Public web' ? 'active web' : ''} onClick={() => setFilter(filter === 'Public web' ? 'All' : 'Public web')} type="button"><span><b>Public web</b><small>Indexed candidates</small></span><i>{publicEvidence.length}</i></button>
        </section>
        <section className="alerts-card"><h3>🔔 Source alerts</h3><p>Scheduled notifications require a delivery provider. Your current report stays saved locally.</p><button type="button" disabled>Alerts not configured</button></section>
        {history.length > 1 && <section className="recent-card"><h3>Recent checks</h3>{history.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => { setScan(item); setFilter('All'); window.history.replaceState(null, '', `/report?scan_id=${encodeURIComponent(item.id)}`); }}><span>{item.profile.firstName}<small>{item.profile.city}</small></span><b>{item.evidence.length}</b></button>)}</section>}
        <button className="new-search" type="button" onClick={startOver}>＋ New self-search</button>
      </aside>

      <section className="report-main">
        <header className="report-topbar"><BrandLink /><span>PRIVATE REPUTATION REPORT</span><button type="button" onClick={() => setImportOpen(true)}>＋ Add Tea evidence</button></header>
        <div className={`report-alert ${teaEvidence.length ? 'found' : ''} ${teaReviewPending ? 'pending' : ''}`}><span>{teaEvidence.length ? '!' : teaReviewPending ? '…' : 'i'}</span><div><h3>{teaEvidence.length ? 'Potential Tea evidence collected' : teaReviewPending ? 'Tea review is queued' : teaSourceIssue ? 'Tea check needs attention' : 'No Tea evidence found'}</h3><p>{teaEvidence.length ? `${teaEvidence.length} item${teaEvidence.length === 1 ? '' : 's'} in this report. Review each one before deciding whether it refers to you.` : teaReviewPending ? 'Your identifiers are saved and waiting for an authorized analyst or configured Tea connector. This report refreshes automatically when the review is completed.' : teaSourceIssue ? teaSource?.note : 'The Tea source check completed without evidence. You can still import material you lawfully possess.'}</p></div></div>

        <div className="report-heading-row"><div><span>{scan.evidence.length} results found</span><h1>{filter === 'All' ? 'Potential matches' : `${filter} results`}</h1></div><small>Scan {scan.id.slice(0, 8)} · {teaReviewPending ? 'In review' : sourceStatusLabel(scan.status)}</small></div>

        <div className="report-grid">
          {visibleEvidence.map((item) => <EvidenceCard item={item} key={item.id} onOpen={() => setSelectedEvidence(item)} />)}
          {visibleEvidence.length === 0 && <div className="report-empty"><span>⌕</span><h2>{teaReviewPending ? 'Review in progress' : 'No evidence collected'}</h2><p>{teaReviewPending ? 'The Tea lookup has been submitted and this report will update automatically.' : filter === 'All' ? 'No matching evidence was returned by completed sources.' : `There are no ${filter} items in this report.`}</p><button type="button" onClick={() => setImportOpen(true)}>Import Tea evidence</button></div>}
        </div>

        <section className="report-section nearby-section"><div><span>⌖</span><div><h2>Nearby public mentions</h2><p>Indexed results tied to the search area</p></div></div>{publicEvidence.length ? <div className="nearby-list">{publicEvidence.map((item) => <EvidenceCard item={item} key={item.id} onOpen={() => setSelectedEvidence(item)} />)}</div> : <p className="section-empty">Public web search is available after adding a provider key.</p>}</section>

        <section className="report-section photo-section"><div><span>◎</span><div><h2>Photo matching</h2><p>Reference image for an authorized face-search provider</p></div></div><div className="photo-status">{scan.profile.photoUrl ? <img src={scan.profile.photoUrl} alt="Private profile reference" /> : <i>＋</i>}<span><b>{scan.profile.photoUrl ? 'Reference photo saved privately' : 'No reference photo added'}</b><small>Automatic image search remains off until an authorized provider is configured.</small></span><em>{scan.profile.photoUrl ? 'Ready' : 'Optional'}</em></div></section>

        <section className="report-section summary-section"><div><span>✓</span><div><h2>Summary</h2><p>What this scan actually completed</p></div></div><ul><li>{teaEvidence.length} Tea evidence item{teaEvidence.length === 1 ? '' : 's'} stored</li><li>{publicEvidence.length} public-web candidate{publicEvidence.length === 1 ? '' : 's'} stored</li>{scan.sources.map((source) => <li key={source.id}>{source.name}: {sourceStatusLabel(source.status)} — {source.note}</li>)}<li>Review every result for namesakes and missing context</li></ul></section>
      </section>

      {importOpen && <div className="report-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => { setImportOpen(false); setError(''); }}>×</button><form className="import-modal" onSubmit={importEvidence}><span className="modal-tea">T</span><h2>Import Tea evidence</h2><p>Add only material you are allowed to possess and process.</p><label>Short title<input name="title" required maxLength={160} placeholder="Tea post mentioning me" /></label><label>Relevant post text<textarea name="excerpt" required maxLength={1200} rows={5} placeholder="Paste the relevant portion…" /></label><div><label>Source link (optional)<input name="sourceUrl" type="url" placeholder="https://…" /></label><label>Date seen<input name="capturedAt" type="date" /></label></div><label>Private screenshot<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>{error && <p className="funnel-error">{error}</p>}<button type="submit" disabled={importing}>{importing ? 'Saving…' : 'Save to report'}</button></form></div>}

      {selectedEvidence && <div className="report-modal detail-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => setSelectedEvidence(null)}>×</button><article>{selectedEvidence.imageUrl && <img src={selectedEvidence.imageUrl} alt="Imported evidence" />}<div className="detail-head"><span>{evidenceLabel(selectedEvidence)}</span><b>{selectedEvidence.confidence}% match</b><small>{selectedEvidence.capturedAt.slice(0, 10)}</small></div><h2>{selectedEvidence.title}</h2><p>{selectedEvidence.excerpt}</p><div className="reason-row">{selectedEvidence.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div><section><h3>Comments</h3><p>Comments appear here when supplied by an authorized source provider. None are stored for this item.</p></section><div className="detail-actions">{selectedEvidence.sourceUrl && <a href={selectedEvidence.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}<button type="button" onClick={() => toggleDismissed(selectedEvidence)}>{selectedEvidence.dismissed ? 'Restore evidence' : 'Mark as not me'}</button></div></article></div>}
    </main>
  );
}

function FunnelStep({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="funnel-step"><span className="step-emoji">{icon}</span><h1>{title}</h1><p className="step-subtitle">{subtitle}</p><div className="step-content">{children}</div></div>;
}

function ReportLoading() {
  return <main className="report-route-state"><BrandLink /><div className="search-orbit"><i /><i /><span>⌕</span></div><h1>Loading your report…</h1><p>Retrieving the latest scan from this private session.</p></main>;
}

function NoReport() {
  return <main className="report-route-state"><BrandLink /><span className="step-emoji">⌕</span><h1>No report yet.</h1><p>Complete a private check in this browser to create a report.</p><div className="report-route-actions"><a href="/check">Start a new check →</a></div></main>;
}

function BrandLink() {
  return <a className="brand funnel-brand" href="/" aria-label="GossipCheck home"><span className="brand-mark" aria-hidden="true"><span className="bubble bubble-back" /><span className="bubble bubble-front">✓</span></span><span>gossipcheck</span><b>.app</b></a>;
}

function Tip({ children }: { children: React.ReactNode }) { return <p className="funnel-tip"><b>Good to know</b>{children}</p>; }

function InfoGrid({ items }: { items: string[][] }) { return <div className="info-grid">{items.map(([icon, title, copy]) => <article key={title}><span>{icon}</span><b>{title}</b><p>{copy}</p></article>)}</div>; }

function EvidenceCard({ item, onOpen }: { item: EvidenceRecord; onOpen: () => void }) {
  return <button className={`evidence-tile ${item.dismissed ? 'dismissed' : ''}`} type="button" onClick={onOpen}>{item.imageUrl ? <img src={item.imageUrl} alt="Evidence preview" /> : <i>{item.source === 'Tea' ? 'T' : 'W'}</i>}<div><div className="tile-meta"><span>{evidenceLabel(item)}</span><b>{item.confidence}%</b><small>{item.capturedAt.slice(0, 10)}</small></div><h3>{item.title}</h3><p>{item.excerpt}</p><footer><span>♡ 0</span><span>▢ 0</span><em>{item.dismissed ? 'Dismissed' : 'Open details →'}</em></footer></div></button>;
}
