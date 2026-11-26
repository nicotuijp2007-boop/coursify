// The learner's certificate for this course: printable, with a code and link anyone can verify.
import { useEffect, useState } from 'react';
import { Copy, GraduationCap, Printer } from 'lucide-react';
import { useApp } from '@/state/app';
import { fmtDate, loadExamState, verifyUrl, type Certificate } from '@/lib/exam';

export function CertificateView({ cert }: { cert: Certificate }) {
  return (
    <article className="certificate" aria-label={`Certificate for ${cert.full_name}`}>
      <div className="cert-border">
        <div className="cert-brand"><GraduationCap size={22} aria-hidden="true" />Coursify</div>
        <p className="cert-kicker">Certificate of achievement</p>
        <p className="cert-small">This certifies that</p>
        <p className="cert-name">{cert.full_name}</p>
        <p className="cert-small">passed the final exam of the course</p>
        <p className="cert-course">{cert.course_title}</p>
        <dl className="cert-facts">
          <div><dt>Score</dt><dd>{cert.score}%</dd></div>
          <div><dt>Date</dt><dd>{fmtDate(cert.issued_at)}</dd></div>
          <div><dt>Certificate code</dt><dd className="cert-code">{cert.code}</dd></div>
        </dl>
        <p className="cert-verify">Check this certificate at <span>{verifyUrl(cert.code)}</span></p>
      </div>
    </article>
  );
}

export function CertificatePage() {
  const { meta, toast } = useApp();
  const [cert, setCert] = useState<Certificate | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadExamState(meta.id).then(s => setCert(s.certificate)).catch(e => setError(e instanceof Error ? e.message : String(e))); }, [meta.id]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(verifyUrl(cert!.code)); toast('Verification link copied.', 'ok'); }
    catch { toast('Your browser blocked copying. Select the link on the certificate instead.', 'err'); }
  };

  return (
    <>
      <header className="hero exam-hero no-print">
        <div className="mp-eyebrow">{meta.title}</div>
        <h1 tabIndex={-1}>Certificate</h1>
      </header>
      {error && <div className="banner" data-tone="err" role="alert"><div><strong>The certificate could not load.</strong>{error}</div></div>}
      {cert === undefined && !error && <p className="muted"><span className="spinner" aria-hidden="true" /> Loading…</p>}
      {cert === null && (
        <div className="card exam-card">
          <h2>No certificate yet</h2>
          <p className="muted">Pass the final exam to get your certificate.</p>
          <a className="btn-primary" href="#exam">Go to the final exam</a>
        </div>
      )}
      {cert && <>
        <div className="btn-row no-print" style={{ marginBottom: 'var(--space-4)' }}>
          <button type="button" className="btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print or save as PDF</button>
          <button type="button" className="btn-secondary" onClick={copyLink}><Copy size={16} aria-hidden="true" />Copy verification link</button>
        </div>
        <CertificateView cert={cert} />
      </>}
    </>
  );
}
