'use client';

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { EvidenceRecord, ScanRecord } from '../../lib/backend-types';

type AppView = 'onboarding' | 'searching' | 'report';

const totalSteps = 11;
const experiences = [
  ['😶', 'A date suddenly went cold'],
  ['👻', 'Someone stopped replying without context'],
  ['👀', 'Friends seemed to know something you did not'],
  ['📱', 'The tone changed after a phone check'],
  ['🤷', 'Interested matches never responded'],
];

const sourceStatusLabel = (status: string) => status === 'complete' ? 'Checked' : status === 'queued' || status === 'running' ? 'In review' : status === 'unconfigured' ? 'Needs setup' : status;
const publicMatchTier = (item: EvidenceRecord) => {
  const hasAge = item.reasons.some((reason) => reason.startsWith('Age ') || reason.startsWith('An age mentioned'));
  const hasLocation = item.reasons.some((reason) => reason.startsWith('Location signal'));
  const hasUsername = item.reasons.some((reason) => reason.startsWith('Username '));
  if (hasUsername || (hasAge && hasLocation)) return 'best';
  if (hasAge || hasLocation) return 'close';
  return 'broad';
};
const datingTopic = (item: EvidenceRecord) => item.reasons.find((reason) => reason.startsWith('Dating/gossip topic:'))?.replace('Dating/gossip topic: ', '') || '';
const profilePlatform = (item: EvidenceRecord) => {
  if (item.kind === 'face_match') return 'Face search';
  if (!item.sourceUrl) return 'Public profile';
  try {
    const host = new URL(item.sourceUrl).hostname.replace(/^www\./, '').toLocaleLowerCase();
    if (host.includes('tinder')) return 'Tinder';
    if (host.includes('hinge')) return 'Hinge';
    if (host.includes('bumble')) return 'Bumble';
    if (host.includes('badoo')) return 'Badoo';
    if (host.includes('okcupid')) return 'OkCupid';
    if (host === 'match.com' || host.endsWith('.match.com')) return 'Match';
    if (host.includes('pof.com')) return 'Plenty of Fish';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('threads')) return 'Threads';
    if (host.includes('facebook')) return 'Facebook';
    return host;
  } catch {
    return 'Public profile';
  }
};
const evidenceLabel = (item: EvidenceRecord) => item.kind === 'manual_import' ? 'User supplied' : item.kind === 'profile_match' ? `${profilePlatform(item)} profile` : item.kind === 'face_match' ? 'Possible profile match' : item.source === 'Public web' ? publicMatchTier(item) === 'best' ? 'Best post match' : publicMatchTier(item) === 'close' ? 'Close post match' : 'Broad name match' : item.confidence >= 83 ? 'Higher identity match' : 'Possible identity match';
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
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshingPosts, setRefreshingPosts] = useState(false);
  const [refreshingProfiles, setRefreshingProfiles] = useState(false);
  const [postRefreshError, setPostRefreshError] = useState('');
  const [profileRefreshError, setProfileRefreshError] = useState('');
  const [profile, setProfile] = useState({ firstName: '', age: '', city: '', instagram: '', experiences: [] as string[], photo: null as File | null, faceConsent: false });

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
    if (step === 11 && profile.photo && !profile.faceConsent) return setError('Confirm that you want the reference photo sent to the configured face-search provider.');
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
          faceSearchConfirmed: Boolean(profile.photo && profile.faceConsent),
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

      const runResponse = await fetch(`/api/scans/${completedScan.id}/run`, { method: 'POST' });
      const runData = await runResponse.json() as { scan?: ScanRecord; error?: string };
      if (!runResponse.ok || !runData.scan) throw new Error(runData.error || 'The source checks could not be completed.');
      completedScan = runData.scan;

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

  const refreshPosts = async () => {
    if (!scan) return;
    setRefreshingPosts(true);
    setPostRefreshError('');
    try {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      const response = await fetch(`/api/scans/${scan.id}/posts${query}`, { method: 'POST' });
      const data = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'Post discovery could not be completed.');
      const updatedScan = withAccessToken(data.scan, accessToken);
      setScan(updatedScan);
      setHistory((current) => current.map((item) => item.id === updatedScan.id ? updatedScan : item));
    } catch (caught) {
      setPostRefreshError(caught instanceof Error ? caught.message : 'Post discovery could not be completed.');
    } finally {
      setRefreshingPosts(false);
    }
  };

  const refreshProfiles = async () => {
    if (!scan) return;
    setRefreshingProfiles(true);
    setProfileRefreshError('');
    try {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      const response = await fetch(`/api/scans/${scan.id}/profiles${query}`, { method: 'POST' });
      const data = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !data.scan) throw new Error(data.error || 'Profile discovery could not be completed.');
      const updatedScan = withAccessToken(data.scan, accessToken);
      setScan(updatedScan);
      setHistory((current) => current.map((item) => item.id === updatedScan.id ? updatedScan : item));
    } catch (caught) {
      setProfileRefreshError(caught instanceof Error ? caught.message : 'Profile discovery could not be completed.');
    } finally {
      setRefreshingProfiles(false);
    }
  };

  const startOver = () => {
    window.location.assign('/check');
  };

  const teaEvidence = scan?.evidence.filter((item) => item.source === 'Tea') || [];
  const postEvidence = useMemo(() => (scan?.evidence.filter((item) => item.kind === 'tea_post' || item.kind === 'web_page' || item.kind === 'manual_import') || []).sort((a, b) => b.confidence - a.confidence), [scan]);
  const profileEvidence = useMemo(() => (scan?.evidence.filter((item) => item.kind === 'profile_match' || item.kind === 'face_match') || []).sort((a, b) => b.confidence - a.confidence), [scan]);
  const datingProfileEvidence = profileEvidence.filter((item) => item.kind === 'profile_match' && item.reasons.some((reason) => reason === 'Dating-app profile'));
  const publicPostEvidence = postEvidence.filter((item) => item.source === 'Public web');
  const faceEvidence = profileEvidence.filter((item) => item.kind === 'face_match');
  const publicSource = scan?.sources.find((source) => source.name === 'Public web');
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
        {step === 4 && <FunnelStep icon="📡" title={`Source coverage near ${profile.city || 'you'}`} subtitle="Here is what GossipCheck can check before your report begins."><InfoGrid items={[["T", "Posts", "Tea evidence and cited public discussions"], ["P", "Profiles", "Dating-app and public social profiles"], ["◎", "Face search", "FaceCheck when a photo and API token are supplied"]]} /><Tip>AI helps discover sources. It cannot verify that a post or profile is about you.</Tip></FunnelStep>}
        {step === 5 && <FunnelStep icon="👀" title="Know what may be shaping first impressions." subtitle="Public posts and screenshots can circulate without reaching the person they mention."><InfoGrid items={[["?", "Missing context", "Names alone can produce false positives"], ["⌁", "Screenshots travel", "Copies may outlive the original post"], ["✓", "Evidence matters", "Review the source before drawing conclusions"]]} /><Tip>A match is a lead to review, never proof that a claim is true.</Tip></FunnelStep>}
        {step === 6 && <FunnelStep icon="🤔" title="Has this ever happened to you?" subtitle="Select any experiences that resonate. This is optional and is not sent to source providers."><div className="choice-list">{experiences.map(([icon, label]) => <button className={profile.experiences.includes(label) ? 'selected' : ''} type="button" key={label} onClick={() => update('experiences', profile.experiences.includes(label) ? profile.experiences.filter((item) => item !== label) : [...profile.experiences, label])}><span>{icon}</span>{label}<i>{profile.experiences.includes(label) ? '✓' : '+'}</i></button>)}</div><Tip>You cannot control what is posted, but you can document and review what you find.</Tip></FunnelStep>}
        {step === 7 && <FunnelStep icon="↗" title="One post can create many copies." subtitle="A report helps you separate the original source from screenshots and reposts."><div className="spread-line">{[["01", "Original post", "Capture its source and date"], ["02", "Comments", "Preserve relevant context"], ["03", "Reposts", "Track duplicates separately"], ["04", "Your report", "Keep verified evidence together"]].map(([number, title, copy]) => <div key={number}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></div>)}</div></FunnelStep>}
        {step === 8 && <FunnelStep icon="🛡️" title="Found something concerning? Build an evidence trail." subtitle="GossipCheck helps organize material for review; it does not promise removal or provide legal advice."><InfoGrid items={[["1", "Collect", "Save the source, date, and screenshot"], ["2", "Verify", "Rule out namesakes and missing context"], ["3", "Respond", "Use the platform’s official reporting process"]]} /><div className="truth-card"><b>Built for careful review</b><span>Private files, ownership checks, source links, and persistent dismiss/restore controls.</span></div></FunnelStep>}
        {step === 9 && <FunnelStep icon="◎" title="What’s your Instagram? (optional)" subtitle="A public username can strengthen identity matching."><div className="handle-input"><span>@</span><input value={profile.instagram.replace(/^@/, '')} onChange={(event) => update('instagram', event.target.value.replace(/^@/, ''))} placeholder="yourusername" /></div><Tip>Skip this if you prefer. GossipCheck never contacts or notifies the account.</Tip></FunnelStep>}
        {step === 10 && <FunnelStep icon="✓" title="What your private report includes" subtitle="Every result stays tied to its source and collection status."><div className="report-preview-list">{['Posts where people discuss your name', 'Dating-app and public social profiles', 'Optional face-search profile matches', 'Source links and identity signals', 'Saved history with dismiss and restore controls'].map((item) => <p key={item}><span>✓</span>{item}</p>)}</div><Tip>Your report never fills an empty search with fake posts or profiles.</Tip></FunnelStep>}
        {step === 11 && <FunnelStep icon="☺" title="Add a photo (optional)" subtitle="Use FaceCheck to look for visually similar faces on public web pages."><label className="photo-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { update('photo', event.target.files?.[0] || null); if (!event.target.files?.[0]) update('faceConsent', false); }} /><span>{profile.photo ? '✓' : '＋'}</span><b>{profile.photo?.name || 'Click to choose a photo'}</b><small>JPG, PNG, or WebP · up to 8 MB</small></label>{profile.photo && <label className="face-consent"><input type="checkbox" checked={profile.faceConsent} onChange={(event) => update('faceConsent', event.target.checked)} /><span><b>Run third-party face search</b><small>I consent to sending this photo to FaceCheck for this self-search. Face results will not be treated as Tea matches.</small></span></label>}<Tip>The original stays private in your report. It is sent to FaceCheck only when you check the consent box and the provider is configured.</Tip></FunnelStep>}
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
        <strong>{['Creating your private report…', 'Checking Tea access…', 'Searching posts and profiles…', 'Validating source citations…'][scanStage]}</strong>
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
          <button className="section-link posts-link" onClick={() => document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth' })} type="button"><span><b>Posts</b><small>Everything said about this name</small></span><i>{postEvidence.length}</i></button>
          <button className="section-link profiles-link" onClick={() => document.getElementById('profiles')?.scrollIntoView({ behavior: 'smooth' })} type="button"><span><b>Profiles</b><small>Dating apps and public profiles</small></span><i>{profileEvidence.length}</i></button>
        </section>
        <section className="alerts-card"><h3>🔔 Source alerts</h3><p>Scheduled notifications require a delivery provider. Your current report stays saved locally.</p><button type="button" disabled>Alerts not configured</button></section>
        {history.length > 1 && <section className="recent-card"><h3>Recent checks</h3>{history.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => { setScan(item); window.history.replaceState(null, '', `/report?scan_id=${encodeURIComponent(item.id)}`); }}><span>{item.profile.firstName}<small>{item.profile.city}</small></span><b>{item.evidence.length}</b></button>)}</section>}
        <button className="new-search" type="button" onClick={startOver}>＋ New self-search</button>
      </aside>

      <section className="report-main">
        <header className="report-topbar"><BrandLink /><span>PRIVATE REPUTATION REPORT</span><button type="button" onClick={() => setImportOpen(true)}>＋ Add Tea evidence</button></header>
        <div className={`report-alert ${teaEvidence.length ? 'found' : ''} ${teaReviewPending ? 'pending' : ''}`}><span>{teaEvidence.length ? '!' : 'i'}</span><div><h3>{teaEvidence.length ? 'Potential Tea evidence collected' : teaReviewPending ? "We haven't found you on the Tea app" : teaSourceIssue ? 'Tea check needs attention' : 'No Tea evidence found'}</h3><p>{teaEvidence.length ? `${teaEvidence.length} item${teaEvidence.length === 1 ? '' : 's'} in this report. Review each one before deciding whether it refers to you.` : teaReviewPending ? 'No matching Tea posts were found for this search.' : teaSourceIssue ? teaSource?.note : 'The Tea source check completed without evidence. You can still import material you lawfully possess.'}</p></div></div>

        <div className="report-heading-row"><div><span>{postEvidence.length + profileEvidence.length} results found</span><h1>What we found for {scan.profile.firstName}</h1></div><small>Scan {scan.id.slice(0, 8)} · {teaReviewPending ? 'In review' : sourceStatusLabel(scan.status)}</small></div>

        <section className="report-section result-section posts-section" id="posts">
          <div className="section-heading"><span>01</span><div><h2>Posts</h2><p>All collected posts where other people discuss “{scan.profile.firstName}”, including Tea evidence and public dating conversations.</p></div><b>{postEvidence.length}</b></div>
          <div className="result-actions"><button type="button" onClick={() => void refreshPosts()} disabled={refreshingPosts}>{refreshingPosts ? 'Searching public conversations…' : publicPostEvidence.length ? 'Refresh public posts' : 'Search public posts'}</button>{postRefreshError && <p role="alert">{postRefreshError}</p>}</div>
          {postEvidence.length > 0 ? <div className="report-grid">{postEvidence.map((item) => <EvidenceCard item={item} key={item.id} onOpen={() => setSelectedEvidence(item)} />)}</div> : <div className="report-empty"><span>⌕</span><h2>{teaReviewPending ? 'Post review in progress' : 'No posts found yet'}</h2><p>{teaReviewPending ? 'The Tea lookup is still being reviewed and this section will update automatically.' : publicSource?.status === 'unconfigured' ? 'Configure OpenRouter or import Tea evidence to populate this section.' : 'No qualifying public post or Tea evidence was returned for this scan.'}</p><button type="button" onClick={() => setImportOpen(true)}>Import Tea evidence</button></div>}
          {publicPostEvidence.length > 0 && <p className="section-footnote">Public post results are possible namesakes. Open the source and check the photos, age, location, and context.</p>}
        </section>

        <section className="report-section result-section profiles-section" id="profiles">
          <div className="section-heading"><span>02</span><div><h2>Profiles</h2><p>Public profiles found under “{scan.profile.firstName}”, with dating apps prioritized before social networks and face-search matches.</p></div><b>{profileEvidence.length}</b></div>
          <div className="profile-coverage"><span><b>{datingProfileEvidence.length}</b><small>Dating-app profiles</small></span><span><b>{profileEvidence.length - datingProfileEvidence.length - faceEvidence.length}</b><small>Social profiles</small></span><span><b>{faceEvidence.length}</b><small>Face-search profiles</small></span></div>
          <div className="result-actions"><button type="button" onClick={() => void refreshProfiles()} disabled={refreshingProfiles}>{refreshingProfiles ? 'Searching dating apps and social profiles…' : profileEvidence.length ? 'Refresh public profiles' : 'Search public profiles'}</button>{profileRefreshError && <p role="alert">{profileRefreshError}</p>}</div>
          {profileEvidence.length > 0 ? <div className="report-grid profile-grid">{profileEvidence.map((item) => <EvidenceCard item={item} key={item.id} onOpen={() => setSelectedEvidence(item)} />)}</div> : <div className="report-empty profiles-empty"><span>◎</span><h2>No public profiles found yet</h2><p>{publicSource?.status === 'failed' ? 'Profile discovery did not complete for this scan.' : publicSource?.status === 'unconfigured' ? 'Configure OpenRouter to search public dating-app and social profile pages.' : scan.profile.photoUrl ? 'No direct public profile page or face-search candidate was returned.' : 'No direct public profile page was returned. Adding a photo on a new scan can also enable face search.'}</p></div>}
          <p className="section-footnote">A matching name or username does not prove a profile belongs to the same person. Verify photos and profile details before drawing conclusions.</p>
        </section>
      </section>

      {importOpen && <div className="report-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => { setImportOpen(false); setError(''); }}>×</button><form className="import-modal" onSubmit={importEvidence}><span className="modal-tea">T</span><h2>Import Tea evidence</h2><p>Add only material you are allowed to possess and process.</p><label>Short title<input name="title" required maxLength={160} placeholder="Tea post mentioning me" /></label><label>Relevant post text<textarea name="excerpt" required maxLength={1200} rows={5} placeholder="Paste the relevant portion…" /></label><div><label>Source link (optional)<input name="sourceUrl" type="url" placeholder="https://…" /></label><label>Date seen<input name="capturedAt" type="date" /></label></div><label>Private screenshot<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>{error && <p className="funnel-error">{error}</p>}<button type="submit" disabled={importing}>{importing ? 'Saving…' : 'Save to report'}</button></form></div>}

      {selectedEvidence && <div className="report-modal detail-modal" role="dialog" aria-modal="true"><button className="modal-close" type="button" onClick={() => setSelectedEvidence(null)}>×</button><article>{selectedEvidence.imageUrl && <img src={selectedEvidence.imageUrl} alt="Evidence preview" />}<div className="detail-head"><span>{evidenceLabel(selectedEvidence)}</span><b>{selectedEvidence.confidence}% identity confidence</b><small>{selectedEvidence.capturedAt.slice(0, 10)}</small></div><h2>{selectedEvidence.title}</h2><p>{selectedEvidence.excerpt}</p><div className="reason-row">{selectedEvidence.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div><div className="reason-row"><span>Provider: {selectedEvidence.provider}</span>{selectedEvidence.subjectAge !== null && <span>Subject age: {selectedEvidence.subjectAge}</span>}{selectedEvidence.subjectLocation && <span>Location: {selectedEvidence.subjectLocation}</span>}{selectedEvidence.kind === 'tea_post' && <span>🚩 {selectedEvidence.redFlags} · 💚 {selectedEvidence.greenFlags}</span>}</div>{selectedEvidence.kind !== 'profile_match' && selectedEvidence.kind !== 'face_match' && <section><h3>Comments ({selectedEvidence.commentCount})</h3>{selectedEvidence.comments.length ? selectedEvidence.comments.map((comment) => <p key={comment.id}><b>{comment.author}</b> {comment.text}{comment.reactions ? ` · ${comment.reactions} reactions` : ''}</p>) : <p>No comment text was supplied by this provider.</p>}</section>}<div className="detail-actions">{selectedEvidence.sourceUrl && <a href={selectedEvidence.sourceUrl} target="_blank" rel="noreferrer">{selectedEvidence.kind === 'profile_match' || selectedEvidence.kind === 'face_match' ? 'Open profile ↗' : 'Open source ↗'}</a>}<button type="button" onClick={() => toggleDismissed(selectedEvidence)}>{selectedEvidence.dismissed ? 'Restore evidence' : 'Mark as not me'}</button></div></article></div>}
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
  const isProfile = item.kind === 'profile_match' || item.kind === 'face_match';
  const fallbackIcon = item.source === 'Tea' ? 'T' : item.kind === 'profile_match' ? 'P' : item.source === 'Face search' ? '◎' : 'W';
  return <button className={`evidence-tile ${isProfile ? 'profile-tile' : ''} ${item.dismissed ? 'dismissed' : ''}`} type="button" onClick={onOpen}>{item.imageUrl ? <img src={item.imageUrl} alt="Evidence preview" /> : <i>{fallbackIcon}</i>}<div><div className="tile-meta"><span>{evidenceLabel(item)}</span><b>{item.confidence}%</b><small>{item.capturedAt.slice(0, 10)}</small></div><h3>{item.title}</h3><p>{item.excerpt}</p><footer><span>{isProfile ? profilePlatform(item) : item.redFlags ? `🚩 ${item.redFlags}` : datingTopic(item) || (item.source === 'Public web' && item.confidence < 50 ? 'Possible namesake' : 'Identity candidate')}</span>{!isProfile && <span>▢ {item.commentCount}</span>}<em>{item.dismissed ? 'Dismissed' : isProfile ? 'View profile →' : 'Open details →'}</em></footer></div></button>;
}
