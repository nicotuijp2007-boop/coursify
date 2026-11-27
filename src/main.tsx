import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { AppProvider } from './state/app';
import { AuthProvider, useAuth } from './state/auth';
import { AuthPage, NewPasswordPage } from './pages/Auth';
import { CatalogPage } from './pages/Catalog';
import { VerifyPage } from './pages/Verify';
import { courseFile, parseCatalog, selectedCourseId, type Catalog, type CourseMeta } from './lib/catalog';
import { supabase, supabaseBackend, supabaseConfigured } from './lib/supabase';
import { openProgress, type Opened } from './lib/sync';
import { browserStorage } from './lib/progress';
import type { Course } from './lib/types';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`${path} could not be loaded (HTTP ${res.status}).`);
  try { return (await res.json()) as T; } catch { throw new Error(`${path} is not valid JSON.`); }
}

function BootCard({ error, retry, label, slow }: { error?: string | null; retry?: () => void; label: string; slow?: boolean }) {
  return (
    <div className="boot">
      <div className="card" role={error ? 'alert' : 'status'}>
        {error ? (
          <>
            <h1 style={{ fontSize: 'var(--text-2xl)' }}>{label} could not load</h1>
            <p className="muted" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>{error} Check your connection, then try again.</p>
            {retry && <button type="button" className="btn-primary" onClick={retry}>Try again</button>}
          </>
        ) : (
          <>
            <span className="spinner" style={{ display: 'inline-block' }} aria-hidden="true" />
            <p style={{ marginTop: 'var(--space-4)' }}>Loading {label.toLowerCase()}…</p>
            {slow && <p className="muted small">This is taking longer than usual.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Runs `load` (again on retry) and shows a loading or error card until it resolves. */
function Loader<T>({ load, label, children, deps }: { load: () => Promise<T>; label: string; children: (v: T) => ReactNode; deps: unknown[] }) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(null); setValue(null); setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    load().then(v => { if (alive) setValue(v); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => clearTimeout(t));
    return () => { alive = false; clearTimeout(t); };
  }, [attempt, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  if (value !== null) return <>{children(value)}</>;
  return <BootCard label={label} error={error} slow={slow} retry={() => setAttempt(a => a + 1)} />;
}

const subscribeUrl = (cb: () => void) => { window.addEventListener('popstate', cb); return () => window.removeEventListener('popstate', cb); };

function CourseLoader({ meta, userId }: { meta: CourseMeta; userId: string }) {
  const backend = useMemo(() => supabaseBackend(supabase, userId), [userId]);
  const load = async () => {
    const [course, d, opened] = await Promise.all([
      getJson<Course>(courseFile(meta.id, 'course.json')),
      meta.kind === 'general' ? Promise.resolve({ sql: '' }) : getJson<{ sql: string }>(courseFile(meta.id, 'dataset.json')),
      openProgress({ backend, storage: browserStorage(), courseId: meta.id, userId, legacyKey: meta.legacyStorageKey }),
    ]);
    if (!Array.isArray(course.modules)) throw new Error(`${courseFile(meta.id, 'course.json')} has no modules list.`);
    return { course, dataset: d.sql, opened } as { course: Course; dataset: string; opened: Opened };
  };
  return (
    <Loader label="The course" load={load} deps={[meta.id, userId]}>
      {v => (
        <AppProvider meta={meta} course={v.course} dataset={v.dataset} opened={v.opened} backend={backend} userId={userId}>
          <App />
        </AppProvider>
      )}
    </Loader>
  );
}

function Courses({ catalog }: { catalog: Catalog }) {
  const { session } = useAuth();
  const [search, setSearch] = useState(location.search);
  useEffect(() => subscribeUrl(() => setSearch(location.search)), []);

  let id = selectedCourseId(search);
  // Links from before the catalogue (e.g. /#m02-l1) open the first course at that page.
  if (!id && location.hash && location.hash !== '#') {
    id = catalog.courses[0].id;
    history.replaceState(history.state, '', `?course=${id}${location.hash}`);
  }
  const meta = id ? catalog.courses.find(c => c.id === id) : undefined;
  if (!meta) return <CatalogPage catalog={catalog} unknown={id} />;
  return <CourseLoader key={meta.id} meta={meta} userId={session!.user.id} />;
}

function Gate() {
  const { session, recovering } = useAuth();
  if (recovering && session) return <NewPasswordPage />;
  if (!session) return <AuthPage />;
  return (
    <Loader label="The course list" load={async () => parseCatalog(await getJson('courses/index.json'))} deps={[]}>
      {catalog => <Courses catalog={catalog} />}
    </Loader>
  );
}

function Root() {
  // Certificate checks are public: no account needed.
  const verify = new URLSearchParams(location.search).get('verify');
  if (verify) return <VerifyPage code={verify} />;
  if (!supabaseConfigured) return <BootCard label="Coursify" error="Sign-in is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are missing from this build." />;
  return <AuthProvider fallback={<BootCard label="Your account" />}><Gate /></AuthProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
