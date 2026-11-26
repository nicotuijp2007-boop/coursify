// Public check of a certificate code (/?verify=CODE). Needs no account: shows only what the certificate shows.
import { useEffect, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { verifyCertificate, type Certificate } from '@/lib/exam';
import { CertificateView } from './Certificate';

export function VerifyPage({ code }: { code: string }) {
  const [res, setRes] = useState<{ valid: boolean; cert?: Certificate } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Check a certificate · Coursify';
    verifyCertificate(code).then(r => setRes(r.valid ? { valid: true, cert: r } : { valid: false }))
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [code]);
  return (
    <main className="catalog verify" id="content">
      <div className="mp-eyebrow">Coursify</div>
      <h1 tabIndex={-1}>Check a certificate</h1>
      {error && <div className="banner" data-tone="err" role="alert"><div><strong>The check could not run.</strong>{error} Try again later.</div></div>}
      {!res && !error && <p className="muted"><span className="spinner" aria-hidden="true" /> Checking {code}…</p>}
      {res && !res.valid && (
        <div className="banner" data-tone="err" role="alert"><CircleX size={20} aria-hidden="true" />
          <div><strong>No certificate with code “{code}” exists.</strong>Check the code for typing mistakes. Certificate codes look like CFY-1A2B-3C4D.</div></div>
      )}
      {res?.valid && res.cert && <>
        <div className="banner" data-tone="ok" role="status"><CircleCheck size={20} aria-hidden="true" />
          <div><strong>This certificate is genuine.</strong>{res.cert.full_name} passed the final exam of {res.cert.course_title} with {res.cert.score}%.</div></div>
        <CertificateView cert={res.cert} />
      </>}
      <p className="small muted" style={{ marginTop: 'var(--space-6)' }}><a href="./">Go to Coursify</a></p>
    </main>
  );
}
