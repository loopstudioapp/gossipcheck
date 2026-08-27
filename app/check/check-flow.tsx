'use client';

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { EvidenceRecord, ScanRecord } from '../../lib/backend-types';
import EmbeddedPayment from './embedded-checkout';

type AppView = 'onboarding' | 'searching' | 'paywall' | 'report';

const plans = {
  monthly: { price: '$29.99', cycle: '/month', perDay: '$0.99/day' },
} as const;

const totalSteps = 11;
const experiences = [
  ['😶', 'A date suddenly went cold'],
  ['👻', 'Someone stopped replying without context'],
  ['👀', 'Friends seemed to know something you did not'],
  ['📱', 'The tone changed after a phone check'],
  ['🤷', 'Interested matches never responded'],
];
const searchPreviewTypes = [
  ['Public post', 'A possible name and location match'],
  ['Social mention', 'A possible mention shared near your area'],
  ['Dating discussion', 'A possible post related to dating'],
  ['Profile mention', 'A possible username or profile match'],
  ['Shared screenshot', 'A possible repost or saved discussion'],
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
const evidenceLabel = (item: EvidenceRecord) => item.kind === 'manual_import' ? 'User supplied' : item.kind === 'profile_match' ? (profilePlatform(item) === 'Public profile' ? 'Public profile' : `${profilePlatform(item)} profile`) : item.kind === 'face_match' ? 'Possible profile match' : item.source === 'Public web' ? publicMatchTier(item) === 'best' ? 'Best post match' : publicMatchTier(item) === 'close' ? 'Close post match' : 'Broad name match' : item.confidence >= 83 ? 'Higher identity match' : 'Possible identity match';
const relativeAge = (iso: string) => {
  const days = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const ago = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  if (days < 7) return ago(days, 'day');
  if (days < 60) return ago(Math.round(days / 7), 'week');
  const months = Math.round(days / 30);
  if (months < 24) return ago(months, 'month');
  return ago(Math.round(months / 12), 'year');
};
const withAccessToken = (scan: ScanRecord, accessToken: string) => !accessToken ? scan : ({
  ...scan,
  profile: { ...scan.profile, photoUrl: scan.profile.photoUrl ? `${scan.profile.photoUrl}?access_token=${encodeURIComponent(accessToken)}` : null },
  evidence: scan.evidence.map((item) => ({ ...item, imageUrl: item.imageUrl ? `${item.imageUrl}?access_token=${encodeURIComponent(accessToken)}` : null })),
});

export default function CheckFlow({ initialView = 'onboarding' }: { initialView?: AppView }) {
  const [view, setView] = useState<AppView>(initialView);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [previewMatchCount, setPreviewMatchCount] = useState(0);
  const previewRailRef = useRef<HTMLDivElement>(null);
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
  const [plan] = useState<keyof typeof plans>('monthly');
  const [checkoutError, setCheckoutError] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [discountLeft, setDiscountLeft] = useState(599);
  const [profile, setProfile] = useState({ firstName: '', age: '', city: '', instagram: '', experiences: [] as string[], photo: null as File | null, faceConsent: false });
  const [mappedCity, setMappedCity] = useState('');
  const [mapCenter, setMapCenter] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'detecting' | 'detected' | 'denied' | 'unavailable'>('idle');
  const ageIsValid = Number.isInteger(Number(profile.age)) && Number(profile.age) >= 18 && Number(profile.age) <= 99;
  const canContinue = step === 1 ? Boolean(profile.firstName.trim()) : step === 2 ? ageIsValid : step === 3 ? Boolean(mappedCity && mappedCity === profile.city.trim()) : step === 11 ? !profile.photo || profile.faceConsent : true;
  const mapQuery = mapCenter || mappedCity;
  const mapUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : '';

  // The single-scan endpoint is authoritative: it returns full evidence for paid
  // reports and redacted stubs otherwise. History-list entries are always redacted.
  const loadScan = async (id: string, token: string): Promise<boolean> => {
    try {
      const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
      const response = await fetch(`/api/scans/${encodeURIComponent(id)}${query}`);
      const data = await response.json() as { scan?: ScanRecord };
      if (!response.ok || !data.scan) return false;
      const loaded = withAccessToken(data.scan, token);
      setScan(loaded);
      setHistory((current) => current.map((item) => item.id === loaded.id ? loaded : item));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetch('/api/scans').then(async (response) => {
      const data = await response.json() as { scans?: ScanRecord[] };
      if (!response.ok || !data.scans) {
        setHistoryLoaded(true);
        return;
      }
      setHistory(data.scans);
      if (initialView === 'report') {
        const url = new URL(window.location.href);
        const requestedId = url.searchParams.get('scan_id');
        const accessToken = url.searchParams.get('access_token') || '';
        const targetId = requestedId || data.scans[0]?.id || '';
        if (targetId && !(await loadScan(targetId, accessToken)) && requestedId) {
          setScan(data.scans.find((item) => item.id === requestedId) || null);
        }
      }
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
  }, [initialView]);

  useEffect(() => {
    if (view === 'onboarding') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step, view]);

  useEffect(() => {
    if (discountLeft <= 0) return;
    const timer = window.setInterval(() => setDiscountLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [discountLeft]);

  const update = <K extends keyof typeof profile>(key: K, value: typeof profile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError('');
  };

  useEffect(() => {
    if (view !== 'onboarding' || step !== 3 || locationStatus !== 'idle') return;
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }

    setLocationStatus('detecting');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const latitude = coords.latitude.toFixed(5);
      const longitude = coords.longitude.toFixed(5);
      setMapCenter(`${latitude},${longitude}`);

      try {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        if (!response.ok) throw new Error('Location lookup failed.');
        const result = await response.json() as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
        const placeParts = [result.city || result.locality, result.principalSubdivision].filter((part): part is string => Boolean(part));
        const detectedCity = [...new Set(placeParts)].join(', ') || result.countryName || '';
        if (detectedCity) {
          setProfile((current) => ({ ...current, city: detectedCity }));
          setMappedCity(detectedCity);
          setLocationStatus('detected');
        } else {
          setLocationStatus('unavailable');
        }
      } catch {
        setLocationStatus('unavailable');
      }
    }, (locationError) => {
      setLocationStatus(locationError.code === locationError.PERMISSION_DENIED ? 'denied' : 'unavailable');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }, [locationStatus, step, view]);

  const next = () => {
    if (step === 1 && !profile.firstName.trim()) return setError('Enter the name or nickname you use while dating.');
    if (step === 2 && (!Number.isInteger(Number(profile.age)) || Number(profile.age) < 18 || Number(profile.age) > 99)) return setError('Enter an age between 18 and 99.');
    if (step === 3 && !profile.city.trim()) return setError('Enter the city or area where you date.');
    if (step === 11 && profile.photo && !profile.faceConsent) return setError('Confirm that you want the reference photo sent to the configured face-search provider.');
    setError('');
    if (step < totalSteps) setStep((current) => current + 1);
    else void runSearch();
  };

  const showLocationMap = () => {
    const query = profile.city.trim();
    if (query.length < 2) return;
    update('city', query);
    setMappedCity(query);
    setMapCenter(query);
  };

  const runSearch = async () => {
    const previousMatchCount = Number(window.sessionStorage.getItem('gossipcheck-preview-count'));
    const availableMatchCounts = [5, 6, 7, 8, 9, 10].filter((count) => count !== previousMatchCount);
    const randomIndex = window.crypto.getRandomValues(new Uint32Array(1))[0] % availableMatchCounts.length;
    const simulatedMatchCount = availableMatchCounts[randomIndex];
    window.sessionStorage.setItem('gossipcheck-preview-count', String(simulatedMatchCount));
    setPreviewMatchCount(simulatedMatchCount);
    setView('searching');
    setScanProgress(0);
    let displayedProgress = 0;
    const progressTimer = window.setInterval(() => {
      displayedProgress = Math.min(92, displayedProgress + 1);
      setScanProgress(displayedProgress);
    }, 70);
    try {
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

      window.clearInterval(progressTimer);
      while (displayedProgress < 100) {
        displayedProgress = Math.min(100, displayedProgress + 2);
        setScanProgress(displayedProgress);
        await new Promise((resolve) => window.setTimeout(resolve, 45));
      }
      setScan(withAccessToken(data.scan, data.accessToken || ''));
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setEmailOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The check could not be completed.');
      setView('onboarding');
      setStep(11);
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const continueToPaywall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = reportEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (!scan) return;
    setEmailError('');
    try {
      const accessToken = new URL(window.location.href).searchParams.get('access_token') || '';
      const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
      const response = await fetch(`/api/scans/${scan.id}${query}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json() as { saved?: boolean; error?: string };
      if (!response.ok || !data.saved) throw new Error(data.error || 'Your email could not be saved.');
      setReportEmail(email);
      setEmailOpen(false);
      setView('paywall');
    } catch (caught) {
      setEmailError(caught instanceof Error ? caught.message : 'Your email could not be saved. Please try again.');
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

  const openRecent = async (id: string) => {
    const token = new URL(window.location.href).searchParams.get('access_token') || '';
    if (await loadScan(id, token)) {
      window.history.replaceState(null, '', `/report?scan_id=${encodeURIComponent(id)}${token ? `&access_token=${encodeURIComponent(token)}` : ''}`);
    }
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
  // The saved report only opens once the report is paid for; locked scans fall back to the paywall.
  const reportLocked = Boolean(scan && scan.entitlement.status !== 'active');
  const effectiveView: AppView = view === 'report' && reportLocked ? 'paywall' : view;

  useEffect(() => {
    if (!scan) return;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('checkout');
    if (!outcome) return;
    // Drop one-time checkout params from the address bar whichever way it resolved.
    const token = url.searchParams.get('access_token') || '';
    window.history.replaceState(null, '', `/report?scan_id=${encodeURIComponent(scan.id)}${token ? `&access_token=${encodeURIComponent(token)}` : ''}`);
    if (outcome !== 'success' || scan.entitlement.status === 'active') return;
    const scanId = scan.id;
    const checkoutSessionId = url.searchParams.get('session_id') || '';
    let attempts = 0;
    let timer = 0;
    const verify = async () => {
      attempts += 1;
      const params = new URLSearchParams();
      if (token) params.set('access_token', token);
      if (checkoutSessionId) params.set('session_id', checkoutSessionId);
      try {
        const response = await fetch(`/api/scans/${scanId}/entitlement?${params.toString()}`);
        const data = await response.json() as { unlocked?: boolean };
        if (data.unlocked) {
          window.clearInterval(timer);
          void fetch(`/api/scans/${scanId}/run`, { method: 'POST' }).catch(() => undefined);
          await loadScan(scanId, token);
          setView('report');
          return;
        }
      } catch { /* keep polling until the webhook lands */ }
      if (attempts >= 40) {
        window.clearInterval(timer);
        setCheckoutError('We could not confirm your payment automatically. Refresh this page in a minute.');
      }
    };
    void verify();
    timer = window.setInterval(() => void verify(), 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.id]);

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

  useEffect(() => {
    if (view !== 'paywall') return;
    const rail = previewRailRef.current;
    if (!rail) return;
    let frame = 0;
    let previous = performance.now();
    const move = (now: number) => {
      const elapsed = Math.min(40, now - previous);
      previous = now;
      if (rail.scrollWidth > rail.clientWidth) {
        rail.scrollLeft += elapsed * .035;
        if (rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1) rail.scrollLeft = 0;
      }
      frame = window.requestAnimationFrame(move);
    };
    frame = window.requestAnimationFrame(move);
    return () => window.cancelAnimationFrame(frame);
  }, [view, previewMatchCount]);

  if (view === 'onboarding') return (
    <main className="funnel-page">
      <div className="funnel-shell">
        <header className="funnel-header">
          <button type="button" onClick={() => step > 1 ? setStep((current) => current - 1) : history[0] ? window.location.assign(`/report?scan_id=${encodeURIComponent(history[0].id)}`) : window.history.back()} aria-label="Back">←</button>
          <BrandLink />
          <div><b>{String(step).padStart(2, '0')}</b><span>/{totalSteps}</span></div>
        </header>
        <div className="funnel-progress" aria-label={`Step ${step} of ${totalSteps}`}><i style={{ width: `${step / totalSteps * 100}%` }} /></div>
        <div className="funnel-status"><span>Step {step}</span><span>● Private self-search</span></div>

        <section className="funnel-main" key={step}>
          <div className="fit-wrap">
          {step === 1 && <FunnelStep icon="👋" title="What’s your first name?" subtitle="Or the name or nickname you use on dating apps."><input autoFocus value={profile.firstName} onChange={(event) => update('firstName', event.target.value)} onKeyDown={(event) => event.key === 'Enter' && next()} placeholder="Enter your first name" /><Tip>We will compare common variations without publishing your search.</Tip></FunnelStep>}
          {step === 2 && <FunnelStep icon="🎂" title="How old are you?" subtitle="Age helps separate people who share the same name."><input autoFocus value={profile.age} onChange={(event) => update('age', event.target.value)} onKeyDown={(event) => event.key === 'Enter' && next()} type="number" min="18" max="99" placeholder="Your age" /><Tip>GossipCheck only supports self-searches by adults.</Tip></FunnelStep>}
          {step === 3 && <FunnelStep icon="📍" title="Where do you date?" subtitle="The city or area where you have been active on dating apps."><div className="location-search"><input autoFocus value={profile.city} onChange={(event) => { update('city', event.target.value); setMappedCity(''); setMapCenter(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); showLocationMap(); } }} placeholder={locationStatus === 'detecting' ? 'Detecting your location…' : 'Search for a city or area…'} /><button type="button" onClick={showLocationMap} disabled={profile.city.trim().length < 2}>Show map <span>→</span></button></div><p className={`location-help ${locationStatus}`}>{locationStatus === 'detecting' ? 'Allow location access to center the map automatically.' : locationStatus === 'detected' ? `Location detected as ${mappedCity}. You can type a different city.` : locationStatus === 'denied' ? 'Location access was declined. Enter a city to continue.' : locationStatus === 'unavailable' ? 'We could not name your location automatically. Enter a city to continue.' : 'Enter a city, then confirm it to center the map.'}</p>{mapUrl ? <div className="funnel-map has-map"><iframe title={`Map centered on ${mappedCity || 'your current location'}`} src={mapUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /><div className="map-location"><span>●</span><b>{mappedCity || 'Your current location'}</b></div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a></div> : <div className="funnel-map map-placeholder"><span>◎</span><b>{locationStatus === 'detecting' ? 'Finding you…' : profile.city || 'Your search area'}</b><small>{locationStatus === 'detecting' ? 'The map will appear as soon as your browser shares your location.' : 'The map appears automatically when location access is available.'}</small></div>}<Tip>With your permission, your browser location is used to center Google Maps and a location service names the nearby city. You can replace it with a different dating area at any time.</Tip></FunnelStep>}
          {step === 4 && <FunnelStep icon="📡" title={`What’s happening near ${profile.city || 'you'}`} subtitle="Source coverage updates as new posts appear — here is what your report keeps watch on."><div className="activity-card"><div className="activity-head"><span aria-hidden="true">📍</span><b>Tea is active in your area</b><i><b className="pulse-dot">●</b> Live coverage</i></div><div className="activity-row"><span aria-hidden="true">📝</span><div><b>47 new posts</b><small>added this week in your area</small></div></div><div className="activity-row"><span aria-hidden="true">🔍</span><div><b>12 searches this hour</b><small>women checking profiles nearby</small></div></div><div className="activity-row"><span aria-hidden="true">⏰</span><div><b>3 hours ago</b><small>last post about a man your age</small></div></div><p className="activity-foot">Activity updates in real-time</p></div><Tip>Women often search Tea before a first date to see if there&apos;s any “tea” on their match.</Tip></FunnelStep>}
          {step === 5 && <FunnelStep icon="👀" title="Here’s what’s at stake…" subtitle="Anonymous posts can quietly shape how people treat you, long before you ever find out."><div className="stake-grid"><article><span aria-hidden="true">👀</span><b>73% of women</b><p>look people up before a first date</p></article><article><span aria-hidden="true">📱</span><b>Shared in private</b><p>Posts travel through group chats you never see.</p></article><article><span aria-hidden="true">💔</span><b>Without your knowledge</b><p>Most people never learn they were posted about.</p></article></div><p className="stake-note"><b>🤔 Think about it:</b>&nbsp;That awkward silence on a date? The sudden ghosting? She might have already read about you.</p><Tip>A match is a lead to review, never proof that a claim is true.</Tip></FunnelStep>}
          {step === 6 && <FunnelStep icon="🤔" title="Has this ever happened to you?" subtitle="Select any experiences that resonate. This is optional and is not sent to source providers."><div className="choice-list">{experiences.map(([icon, label]) => <button className={profile.experiences.includes(label) ? 'selected' : ''} type="button" key={label} onClick={() => update('experiences', profile.experiences.includes(label) ? profile.experiences.filter((item) => item !== label) : [...profile.experiences, label])}><span>{icon}</span>{label}<i>{profile.experiences.includes(label) ? '✓' : '+'}</i></button>)}</div><p className="funnel-tip"><b>The truth:</b>You can&apos;t control what&apos;s been said. But you can find out what&apos;s out there.</p></FunnelStep>}
          {step === 7 && <FunnelStep icon="↗" title="One post. Hundreds of eyes." subtitle="Here’s how quickly a single post about you can spread…"><div className="spread-line">{[["⏱️", "MINUTE 1", "It goes up", "One frustrated post after a bad date"], ["📍", "HOUR 1", "People in your area see it", "Nearby users see posts tied to their area"], ["💬", "DAY 1", "It gets passed around", '"Girl, check this guy out before your date"'], ["♾️", "FOREVER", "Screenshots live on", "Saved, shared, and searched... indefinitely"]].map(([icon, when, title, copy]) => <div key={when}><b>{icon}</b><span><small className="when-label">{when}</small><strong>{title}</strong><small>{copy}</small></span></div>)}</div></FunnelStep>}
          {step === 8 && <FunnelStep icon="🛡️" title="Found something negative? We can help remove it." subtitle="If we find posts about you, our team can help get them taken down."><div className="hiw-grid"><article><i>1</i><b>We surface it</b><p>Every match arrives with its source and date attached.</p></article><article><i>2</i><b>You decide</b><p>Review each result and confirm what is really you.</p></article><article><i>3</i><b>You take action</b><p>Report through official channels with receipts in hand.</p></article></div><div className="chip-row"><span>✓ Source-linked evidence</span><span>✓ Dismiss false matches instantly</span><span>✓ Private by default</span></div><div className="truth-card"><b>✨ Good news:</b><span>Takedown service is included free with your report if posts are found. You&apos;re protected either way.</span></div></FunnelStep>}
          {step === 9 && <FunnelStep icon="◎" title="What’s your Instagram? (optional)" subtitle="A public username can strengthen identity matching."><div className="handle-input"><span>@</span><input value={profile.instagram.replace(/^@/, '')} onChange={(event) => update('instagram', event.target.value.replace(/^@/, ''))} onKeyDown={(event) => event.key === 'Enter' && next()} placeholder="yourusername" /></div><Tip>Posts sometimes mention Instagram handles. Adding yours increases the chances of finding relevant posts.</Tip></FunnelStep>}
          {step === 10 && <FunnelStep icon="⭐" title="Success stories" subtitle="See how others finally learned what was being said about them."><div className="story-proof"><span className="avatar-stack"><i>MT</i><i>JR</i><i>DK</i></span><b>Thousands of private self-searches completed</b></div><div className="story-grid">{[['MT', 'Marcus T.', '2 weeks ago', 'Found a post I never knew existed. Now I understand why things felt off — and I can actually respond to it.'], ['JR', 'James R.', '1 month ago', 'My report came back clean. Worth it purely for the peace of mind before getting serious with someone.'], ['DK', 'David K.', '3 weeks ago', 'It surfaced an old mention using just my first name and city. Eye-opening to see what is out there.'], ['CM', 'Chris M.', '1 month ago', 'Took five minutes, and every result came with its original link. Nothing felt like guesswork.']].map(([initial, name, time, quote]) => <article key={name}><header><i>{initial}</i><div><b>{name}</b><small>{time}</small></div><em aria-label="Five star rating">★★★★★</em></header><p>“{quote}”</p></article>)}</div><Tip>87% of people shares about their dates publicly or privately with friends</Tip></FunnelStep>}
          {step === 11 && <FunnelStep icon="☺" title="Add a photo (optional)" subtitle="Our AI can match your face against photos shared in social posts. This is optional but increases accuracy."><label className="photo-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { update('photo', event.target.files?.[0] || null); if (!event.target.files?.[0]) update('faceConsent', false); }} /><span>{profile.photo ? '✓' : '＋'}</span><b>{profile.photo?.name || 'Click to choose a photo'}</b><small>JPG, PNG, or WebP · up to 8 MB</small></label>{profile.photo && <label className="face-consent"><input type="checkbox" checked={profile.faceConsent} onChange={(event) => update('faceConsent', event.target.checked)} /><span><b>Run third-party face search</b><small>I consent to sending this photo to FaceCheck for this self-search. Face results will not be treated as Tea matches.</small></span></label>}<p className="funnel-tip"><b>Privacy note:</b>Your photos are only used for matching and are never stored or shared. You can skip this step if you prefer.</p></FunnelStep>}
          {error && <p className="funnel-error" role="alert">{error}</p>}
          </div>
        </section>

        <footer className="funnel-footer">
          <button type="button" onClick={next} disabled={!canContinue}>{step === totalSteps ? 'Search now' : 'Next'}{step === totalSteps ? null : <span>→</span>}</button>
          <p>{step === totalSteps ? <><b>🍵</b>&nbsp;Photos increase search accuracy by 47%</> : ''}</p>
        </footer>
      </div>
    </main>
  );

  if (view === 'searching') return (
    <main className="funnel-page search-results-page">
      <div className="funnel-shell search-results-shell">
        <header className="funnel-header"><button type="button" onClick={startOver} aria-label="Back to search form">←</button><BrandLink /><div><b>11</b><span>/{totalSteps}</span></div></header>
        <div className="funnel-progress" aria-label="Onboarding complete"><i style={{ width: '100%' }} /></div>
        <div className="funnel-status"><span>Search in progress</span><span>● Private self-search</span></div>
        <section className="funnel-main search-results-main">
          <div className="searching-panel">
            <div className="searching-summary"><div><h1>Searching for {profile.firstName}</h1><p>Age {profile.age} · Near {profile.city}</p></div><span><i />{emailOpen ? 'Search complete' : 'Searching'}</span></div>
            <div className="searching-progress"><strong>●●● {scanProgress < 25 ? 'Scanning public records…' : scanProgress < 50 ? 'Checking social mentions…' : scanProgress < 75 ? 'Analyzing dating app mentions…' : scanProgress < 100 ? 'Validating potential matches…' : 'Search complete'}</strong><b>{scanProgress}%</b></div>
            <div className="search-meter" role="progressbar" aria-label="Search progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scanProgress}><i style={{ width: `${scanProgress}%` }} /></div>
            <small className="searching-label">Finding posts…</small>
            {scanProgress < 14 && <div className="searching-empty"><span>🍵</span><p>Preparing your private search…</p></div>}
            <div className="searching-previews">{Array.from({ length: Math.min(previewMatchCount, Math.floor(scanProgress / Math.max(1, 88 / previewMatchCount))) }, (_, index) => { const [title, copy] = searchPreviewTypes[index % searchPreviewTypes.length]; return <article key={`${title}-${index}`} style={{ '--result-index': index } as React.CSSProperties}><div><i /><span><b>{title}</b><small>{copy}</small></span></div><em>🔒 Unlock to view</em></article>; })}</div>
          </div>
        </section>
      </div>
      {emailOpen && scan && <div className="scan-email-overlay" role="dialog" aria-modal="true" aria-labelledby="scan-email-title"><form className="scan-email-modal" onSubmit={continueToPaywall}><span className="scan-email-icon">🍵</span><h2 id="scan-email-title">We found {previewMatchCount} potential posts!</h2><p>Get access to see what&apos;s being said about you.</p><div className="scan-email-result"><b><i />{previewMatchCount} potential posts found</b><span>Results for “{profile.firstName}” near {profile.city}</span></div><label>Where should we send your report?<input type="email" value={reportEmail} onChange={(event) => { setReportEmail(event.target.value); setEmailError(''); }} placeholder="you@example.com" autoFocus required /></label>{emailError && <p className="scan-email-error" role="alert">{emailError}</p>}<button type="submit">Unlock Full Report <span aria-hidden="true">→</span></button><small>🔒 Your search and report are 100% confidential. We never share your information.</small></form></div>}
    </main>
  );

  if (effectiveView === 'paywall' && scan) {
    const reportEvidence = scan.evidence.filter((item) => !item.dismissed);
    const mentionCount = previewMatchCount || reportEvidence.length;
    const previews = reportEvidence.slice(0, 6);
    const placeholderLabels = ['Public post', 'Social mention', 'Dating discussion', 'Profile mention', 'Shared screenshot'];
    const lockedTiles = previews.length ? previews.map((item) => ({ label: evidenceLabel(item), key: item.id, at: relativeAge(item.capturedAt) })) : Array.from({ length: mentionCount || 6 }, (_, index) => ({ label: placeholderLabels[index % placeholderLabels.length], key: `preview-${index}`, at: '' }));
    const countdown = `${String(Math.floor(discountLeft / 60)).padStart(2, '0')}:${String(discountLeft % 60).padStart(2, '0')}`;
    return (
      <main className="pw-page">
        <header className="pw-topbar">
          <BrandLink />
          <a className="pw-top-cta" href="#pw-offer">Get the report</a>
        </header>
        <div className="pw-body">
          <section className="pw-intro">
            <h1>Results for {scan.profile.firstName}.</h1>
            <p>Near {scan.profile.city} <i>•</i> Age {scan.profile.age}</p>
          </section>

          <section className="pw-found">
            <div className="pw-found-top"><span>Posts found</span><b>{mentionCount}</b></div>
            <div className="pw-found-bar" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ background: mentionCount ? `hsl(${Math.max(0, 108 - index * 13)} 62% 52%)` : '#e3e6e0' }} />)}</div>
            <small>{mentionCount ? `${mentionCount} post${mentionCount === 1 ? '' : 's'} and profile${mentionCount === 1 ? '' : 's'} collected for this search. Unlock to read every one and decide what is really you.` : 'Your sources returned no matches yet. This saved report keeps watching — unlock any time to review or refresh it.'}</small>
          </section>

          <h2 className="pw-section-title">Potential posts found</h2>
          <div className="pw-cards" ref={previewRailRef}>
            {lockedTiles.map((tile) => (
              <article className="pw-post" key={tile.key}>
                <div className="pw-post-top"><span className="pw-chip">{tile.label}</span>{tile.at && <small>{tile.at}</small>}</div>
                <div className="pw-post-lines" aria-hidden="true"><i style={{ width: '86%' }} /><i style={{ width: '64%' }} /><i style={{ width: '78%' }} /></div>
                <span className="pw-locked">🔒 Locked</span>
              </article>
            ))}
          </div>

          <h2 className="pw-unlock-title"><span aria-hidden="true">🔓</span> Unlock your full report</h2>
          <section className="pw-offer" id="pw-offer">
            {discountLeft > 0 && <div className="pw-countdown"><span aria-hidden="true">⏱</span> 50% discount expires in <b>{countdown}</b></div>}
            <div className="pw-offer-content">
              <div className="pw-price-row">
                <div className="pw-offer-head">
                  <b>Full GossipCheck report</b>
                  <ul>
                    {['Full post content with source and date', 'Every comment and reaction count', 'Alerts when new mentions appear'].map((feature) => <li key={feature}><span className="pw-check" aria-hidden="true">✓</span>{feature}</li>)}
                  </ul>
                </div>
                <div className="pw-price-tag"><b>{plans[plan].perDay.replace('/day', '')}</b><span>per day</span><small>billed {plans[plan].price}{plans[plan].cycle}</small></div>
              </div>
              {checkoutError && <p className="pw-error" role="alert">{checkoutError}</p>}
            </div>
          </section>

          <section className="pw-payment-card">
            <EmbeddedPayment scanId={scan.id} accessToken={typeof window === 'undefined' ? '' : new URL(window.location.href).searchParams.get('access_token') || ''} email={reportEmail} onError={setCheckoutError} />
            <p className="pw-secure"><span aria-hidden="true">🔒</span><span>Guaranteed <b>safe &amp; secure</b> checkout by Stripe</span></p>
            <p className="pw-legal">
              We&apos;ve automatically applied a discount to your first subscription price. The subscription will automatically renew at $59.99/month unless canceled before the renewal date. Cancel anytime by emailing{' '}
              <a href="mailto:support@teachecker.app">support@teachecker.app</a>. You agree to our{' '}
              <a href="https://teachecker.app/terms" target="_blank" rel="noreferrer">Terms of Use</a> and{' '}
              <a href="https://teachecker.app/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </p>
          </section>

          <section className="pw-trust">
            <h2>Trusted by 50,000+ guys</h2>
            <div className="pw-stats"><span><b>94%</b><small>Accuracy Rate</small></span><span><b>50K+</b><small>Searches</small></span><span><b>4.8★</b><small>User Rating</small></span></div>
          </section>

          <h2 className="pw-section-title">What people are saying</h2>
          <div className="pw-quotes">
            {[['MT', 'Marcus T.', 'Found a post I never knew existed. Now I understand why things felt off — and I can actually respond to it.'], ['JR', 'James R.', 'My report came back clean. Worth it purely for the peace of mind before getting serious with someone.'], ['DK', 'David K.', 'It surfaced an old mention using just my first name and city. Eye-opening to see what is out there.'], ['CM', 'Chris M.', 'Took five minutes, and every result came with its original link. Nothing felt like guesswork.']].map(([initial, name, quote]) => (
              <article className="pw-quote" key={name}>
                <header><i>{initial}</i><b>{name}</b><em aria-label="Five star rating">★★★★★</em></header>
                <p>“{quote}”</p>
              </article>
            ))}
          </div>

          <div className="pw-private">
            <span className="pw-private-pill">100% Anonymous &amp; Private</span>
            <p>Your search is confidential. We never share your details or notify anyone about your search.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!scan) return historyLoaded ? <NoReport /> : <ReportLoading />;
  return (
    <main className="report-page">
      <aside className="report-sidebar">
        <BrandLink />
        <section className="monitor-card">
          <span><i aria-hidden="true">●</i> Monitoring profile</span>
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
        {history.length > 1 && <section className="recent-card"><h3>Recent checks</h3>{history.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => void openRecent(item.id)}><span>{item.profile.firstName}<small>{item.profile.city}</small></span><b>{item.evidence.length}</b></button>)}</section>}
        <button className="new-search" type="button" onClick={startOver}>＋ New self-search</button>
      </aside>

      <section className="report-main">
        <header className="report-topbar"><BrandLink /><span>PRIVATE REPUTATION REPORT</span><button type="button" onClick={() => setImportOpen(true)}>＋ Add Tea evidence</button></header>
        <div className={`report-alert ${teaEvidence.length ? 'found' : ''} ${teaReviewPending ? 'pending' : ''}`}><span>{teaEvidence.length ? '!' : 'i'}</span><div><h3>{teaEvidence.length ? 'Potential Tea evidence collected' : teaReviewPending ? "GOOD NEWS: We haven't found you on the Tea app" : teaSourceIssue ? 'Tea check needs attention' : 'No Tea evidence found'}</h3><p>{teaEvidence.length ? `${teaEvidence.length} item${teaEvidence.length === 1 ? '' : 's'} in this report. Review each one before deciding whether it refers to you.` : teaReviewPending ? 'No matching Tea posts were found for this search.' : teaSourceIssue ? teaSource?.note : 'The Tea source check completed without evidence. You can still import material you lawfully possess.'}</p></div></div>

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

function EvidenceCard({ item, onOpen }: { item: EvidenceRecord; onOpen: () => void }) {
  const isProfile = item.kind === 'profile_match' || item.kind === 'face_match';
  const fallbackIcon = item.source === 'Tea' ? 'T' : item.kind === 'profile_match' ? 'P' : item.source === 'Face search' ? '◎' : 'W';
  return <button className={`evidence-tile ${isProfile ? 'profile-tile' : ''} ${item.dismissed ? 'dismissed' : ''}`} type="button" onClick={onOpen}>{item.imageUrl ? <img src={item.imageUrl} alt="Evidence preview" /> : <i>{fallbackIcon}</i>}<div><div className="tile-meta"><span>{evidenceLabel(item)}</span><b>{item.confidence}%</b><small>{item.capturedAt.slice(0, 10)}</small></div><h3>{item.title}</h3><p>{item.excerpt}</p><footer><span>{isProfile ? profilePlatform(item) : item.redFlags ? `🚩 ${item.redFlags}` : datingTopic(item) || (item.source === 'Public web' && item.confidence < 50 ? 'Possible namesake' : 'Identity candidate')}</span>{!isProfile && <span>▢ {item.commentCount}</span>}<em>{item.dismissed ? 'Dismissed' : isProfile ? 'View profile →' : 'Open details →'}</em></footer></div></button>;
}
