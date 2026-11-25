import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { AppProvider } from './state/app';
import type { Course } from './lib/types';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`${path} could not be loaded (HTTP ${res.status}).`);
  try { return (await res.json()) as T; } catch { throw new Error(`${path} is not valid JSON.`); }
}

/** Loads course content first; the database engine starts in the background afterwards. */
function Boot() {
  const [data, setData] = useState<{ course: Course; dataset: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setError(null);
    const t = setTimeout(() => setSlow(true), 4000);
    Promise.all([getJson<Course>('data/course.json'), getJson<{ sql: string }>('data/dataset.json')])
      .then(([course, d]) => {
        if (!Array.isArray(course.modules)) throw new Error('data/course.json has no modules list.');
        setData({ course, dataset: d.sql });
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => clearTimeout(t));
    return () => clearTimeout(t);
  }, [attempt]);

  if (data) return <AppProvider course={data.course} dataset={data.dataset}><App /></AppProvider>;
  return (
    <div className="boot">
      <div className="card" role={error ? 'alert' : 'status'}>
        {error ? (
          <>
            <h1 style={{ fontSize: 'var(--text-2xl)' }}>The course content could not load</h1>
            <p className="muted" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>{error} Check your connection, then try again.</p>
            <button type="button" className="btn-primary" onClick={() => setAttempt(a => a + 1)}>Try again</button>
          </>
        ) : (
          <>
            <span className="spinner" style={{ display: 'inline-block' }} aria-hidden="true" />
            <p style={{ marginTop: 'var(--space-4)' }}>Loading the course…</p>
            {slow && <p className="muted small">This is taking longer than usual.</p>}
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boot /></StrictMode>);
