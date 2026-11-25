// App-wide state: course content, the practice engine, saved progress, toasts and the confirm dialog.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Engine, type EngineStatus } from '@/lib/engine';
import { browserHost } from '@/lib/browser-host';
import { browserStorage, loadProgress, saveProgress, type LoadIssue, type Progress } from '@/lib/progress';
import type { Course } from '@/lib/types';

type MapKey = 'ex' | 'drafts' | 'quiz' | 'lessons' | 'practical' | 'kit' | 'proj' | 'quizBest' | 'revealed';
export type Tone = 'ok' | 'err' | 'info';
interface Toast { id: number; text: string; tone: Tone }

interface AppValue {
  course: Course;
  dataset: string;
  engine: Engine;
  status: EngineStatus;
  P: Progress;
  /** Set (or with `undefined` remove) one entry of a progress map, then save. */
  setP: <K extends MapKey>(map: K, key: string, value: Progress[K][string] | undefined) => void;
  setLast: (hash: string) => void;
  storageIssue: LoadIssue | null;
  saveFailed: boolean;
  toast: (text: string, tone?: Tone) => void;
  confirm: (title: string, body: string, action: string) => Promise<boolean>;
}

const Ctx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

export function AppProvider({ course, dataset, children }: { course: Course; dataset: string; children: ReactNode }) {
  const storage = useMemo(browserStorage, []);
  const [{ progress: initial, issue }] = useState(() => loadProgress(storage));
  const [P, setProgress] = useState<Progress>(initial);
  const [saveFailed, setSaveFailed] = useState(false);
  const [status, setStatus] = useState<EngineStatus>({ state: 'starting', label: 'Database starting' });
  const engine = useMemo(() => new Engine(browserHost, course.setups, dataset, setStatus), [course, dataset]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);

  useEffect(() => {
    engine.start().catch(e => console.error('Database engine failed to start', e));
  }, [engine]);

  // Save after every change. Unusable stored text was already copied to a backup key by loadProgress,
  // so saving over it is safe. The first render is skipped: nothing has changed yet.
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) { loaded.current = false; return; }
    setSaveFailed(!saveProgress(storage, P));
  }, [P, storage]);

  const setP = useCallback<AppValue['setP']>((map, key, value) => {
    setProgress(prev => {
      const m = { ...(prev[map] as Record<string, unknown>) };
      if (value === undefined) delete m[key]; else m[key] = value;
      return { ...prev, [map]: m };
    });
  }, []);

  const setLast = useCallback((hash: string) => {
    setProgress(prev => (prev.last === hash ? prev : { ...prev, last: hash }));
  }, []);

  const toast = useCallback((text: string, tone: Tone = 'info') => {
    const id = nextToast.current++;
    setToasts(t => [...t.slice(-3), { id, text, tone }]);
    if (tone !== 'err') setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const [dialog, setDialog] = useState<{ title: string; body: string; action: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((title: string, body: string, action: string) =>
    new Promise<boolean>(resolve => setDialog({ title, body, action, resolve })), []);

  const value: AppValue = { course, dataset, engine, status, P, setP, setLast, storageIssue: issue, saveFailed, toast, confirm };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast-item" data-tone={t.tone} role={t.tone === 'err' ? 'alert' : undefined}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog {...dialog} done={v => { dialog.resolve(v); setDialog(null); }} />}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ title, body, action, done }: { title: string; body: string; action: string; done: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    actionRef.current?.focus(); // showModal() would otherwise focus Cancel, the first button
    const back = opener.current;
    return () => { if (back instanceof HTMLElement) back.focus(); };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="dlg-title" onCancel={e => { e.preventDefault(); done(false); }}
      onClick={e => { if (e.target === ref.current) done(false); }}>
      <h2 id="dlg-title">{title}</h2>
      <p className="muted">{body}</p>
      <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-6)' }}>
        <button type="button" className="btn-ghost" onClick={() => done(false)}>Cancel</button>
        <button type="button" className="btn-primary" ref={actionRef} onClick={() => done(true)}>{action}</button>
      </div>
    </dialog>
  );
}
