'use client';

/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useState } from 'react';

type ReviewScan = {
  id: string;
  createdAt: string;
  firstName: string;
  age: number;
  city: string;
  usernames: string[];
  photoUrl: string | null;
};

export default function ReviewDashboard() {
  const [token, setToken] = useState('');
  const [scans, setScans] = useState<ReviewScan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadQueue = async (reviewToken = token) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/review/scans', { headers: { Authorization: `Bearer ${reviewToken}` } });
      const data = await response.json() as { scans?: ReviewScan[]; error?: string };
      if (!response.ok || !data.scans) throw new Error(data.error || 'The review queue could not be loaded.');
      setScans(data.scans);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadQueue();
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>, scanId: string) => {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitter) submitter.disabled = true;
    try {
      const response = await fetch(`/api/review/scans/${scanId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: new FormData(form),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'The review could not be saved.');
      setScans((current) => current.filter((item) => item.id !== scanId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The review could not be saved.');
      if (submitter) submitter.disabled = false;
    }
  };

  return <main className="review-page">
    <header className="review-header">
      <a className="brand funnel-brand" href="/" aria-label="GossipCheck home"><span className="brand-mark" aria-hidden="true"><span className="bubble bubble-back" /><span className="bubble bubble-front">✓</span></span><span>gossipcheck</span><b>.app</b></a>
      <span>AUTHORIZED ANALYST WORKSPACE</span>
      <a href="/report">Customer report →</a>
    </header>

    <section className="review-intro">
      <span>Private operations</span>
      <h1>Tea review queue.</h1>
      <p>Complete only searches you are authorized to perform. Every submitted result is written to the customer’s private report with source status and review context.</p>
    </section>

    <form className="review-unlock" onSubmit={unlock}>
      <label>Analyst token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} required placeholder="From ANALYST_REVIEW_TOKEN" /></label>
      <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Open queue'}</button>
    </form>

    {error && <p className="review-error" role="alert">{error}</p>}
    {!loading && token && !error && scans.length === 0 && <div className="review-empty"><span>✓</span><h2>Queue clear</h2><p>No Tea reviews are waiting.</p></div>}

    <section className="review-list">
      {scans.map((scan) => <article className="review-card" key={scan.id}>
        <div className="review-profile">
          <ReviewPhoto scan={scan} token={token} />
          <div><span>Submitted {new Date(scan.createdAt).toLocaleString()}</span><h2>{scan.firstName}, {scan.age}</h2><p>⌖ {scan.city}</p>{scan.usernames.length > 0 && <small>@{scan.usernames.join(' · @')}</small>}</div>
        </div>
        <form onSubmit={(event) => void submitReview(event, scan.id)}>
          <label>Review outcome<select name="outcome" defaultValue="not_found"><option value="not_found">No matching record</option><option value="found">Potential match found</option><option value="uncertain">Uncertain match</option></select></label>
          <label>Evidence title<input name="title" maxLength={160} placeholder="Required for found or uncertain" /></label>
          <label className="full">Evidence summary<textarea name="excerpt" rows={4} maxLength={1200} placeholder="Relevant context only; do not include unrelated personal data." /></label>
          <label>Source link<input name="sourceUrl" type="url" placeholder="https://…" /></label>
          <label>Date seen<input name="capturedAt" type="date" /></label>
          <label className="full">Private screenshot<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <button type="submit">Complete review →</button>
        </form>
      </article>)}
    </section>
  </main>;
}

function ReviewPhoto({ scan, token }: { scan: ReviewScan; token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!scan.photoUrl) return;
    let objectUrl = '';
    let active = true;
    fetch(scan.photoUrl, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [scan.photoUrl, token]);
  return url ? <img src={url} alt="Private customer reference" /> : <i>{scan.firstName.charAt(0).toUpperCase()}</i>;
}
