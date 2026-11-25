// Worked examples, common mistakes and exercises. Behaviour follows the original course
// (legacy.html: renderLesson, wireExercise, wireJsExercise); presentation follows the kit's SqlExercise.
import { useState, type ReactNode } from 'react';
import { BookOpen, Bug, Database, Eye, EyeOff, Lightbulb, ListChecks, Play, Code } from 'lucide-react';
import { ActButton, Feedback, Logs, ResLabel, ResultTable, StatusChip } from './ui';
import { Editor } from './Editor';
import { Html } from './Html';
import { exerciseState } from '@/lib/course-progress';
import type { JsResult } from '@/lib/engine';
import type { Example, Exercise, Mistake, Module, Practical, ResultTable as Table } from '@/lib/types';
import { useApp } from '@/state/app';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Result area. `n` changes on every run so the panel re-animates even when content is identical. */
function Out({ n, children }: { n: number; children: ReactNode }) {
  return <div className="res fb-wrap" aria-live="polite">{children && <div key={n} className="res-enter fb-wrap">{children}</div>}</div>;
}

function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<ReactNode>(null);
  const [n, setN] = useState(0);
  const go = (what: string, fn: () => Promise<ReactNode>) => async () => {
    if (busy) return;
    setBusy(what);
    try { setOut(await fn()); } finally { setBusy(null); setN(x => x + 1); }
  };
  return { busy, out, setOut: (o: ReactNode) => { setOut(o); setN(x => x + 1); }, n, go };
}

const pgError = (e: unknown, extra = '') => (
  <><ResLabel>What PostgreSQL says</ResLabel><Feedback tone="err" title="Error:">{msg(e) + (extra ? '\n' + extra : '')}</Feedback></>
);

// ------------------------------------------------------------------ worked example
export function ExampleCard({ mod, idx, ex, i }: { mod: Module; idx: number; ex: Example; i: number }) {
  const { engine } = useApp();
  const [code, setCode] = useState(ex.js ?? ex.sql ?? '');
  const r = useRunner();
  const run = r.go('run', async () => {
    if (ex.js) {
      try { const res = await engine.runExampleJs(mod, idx, code); return <><ResLabel>Your output</ResLabel><Logs {...res} /></>; }
      catch (e) { return <Feedback tone="err" title="Error:">{msg(e)}</Feedback>; }
    }
    try { return <><ResLabel>Your output</ResLabel><ResultTable t={await engine.runExample(mod, idx, i, code)} /></>; }
    catch (e) { return pgError(e, /already exists/.test(msg(e)) ? 'This example has already run in this lesson. Use Reset database to start the lesson again.' : ''); }
  });
  const expected = ex.js ? <><ResLabel>Expected output</ResLabel><Logs logs={ex.logs} error={ex.jsError} /></>
    : ex.output ? <><ResLabel>Expected output</ResLabel><ResultTable t={ex.output} max={15} /></>
    : ex.error ? <><ResLabel>What PostgreSQL says</ResLabel><Feedback tone="err" title="Error:" pop={false}>{ex.error}</Feedback></> : null;
  return (
    <div className="work-card" data-ex={i}>
      <div className="work-head">
        <span className="mp-eyebrow"><BookOpen size={16} aria-hidden="true" />Example {i + 1}</span>
        {ex.temp && <span className="mp-chip" data-tone="warn">Runs in a rollback</span>}
        <span className="grow" />
        {ex.manual ? <span className="mp-chip" data-tone="muted">Run on your own computer</span>
          : <ActButton className="btn-secondary btn-sm" busy={r.busy === 'run'} onClick={run} data-act="run"><Play size={15} aria-hidden="true" />{ex.js ? 'Run code' : 'Run query'}</ActButton>}
      </div>
      <div className="work-body">
        <Html html={ex.note} />
        <Editor value={code} onChange={setCode} onRun={ex.manual ? undefined : run} label={`Example ${i + 1} ${ex.js ? 'code' : 'SQL'}`} />
        <Out n={r.n}>{r.out ?? expected}</Out>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ common mistake
export function MistakeCard({ mod, idx, m, i }: { mod: Module; idx: number; m: Mistake; i: number }) {
  const { engine } = useApp();
  const [code, setCode] = useState(m.sql ?? '');
  const r = useRunner();
  const run = r.go('run', async () => {
    try { return <><ResLabel>Your output</ResLabel><ResultTable t={await engine.runMistake(mod, idx, code)} /></>; }
    catch (e) { return pgError(e); }
  });
  const shown = m.error ? <><ResLabel>What PostgreSQL says</ResLabel><Feedback tone="err" title="Error:" pop={false}>{m.error}</Feedback></>
    : m.output ? <><ResLabel>It runs, and returns this</ResLabel><ResultTable t={m.output} max={10} /></> : null;
  return (
    <div className="work-card" data-kind="mistake" data-mis={i}>
      <div className="work-head">
        <span className="mp-eyebrow"><Bug size={16} aria-hidden="true" />Mistake {i + 1}</span>
        <span className="grow" />
        {m.sql && <ActButton className="btn-secondary btn-sm" busy={r.busy === 'run'} onClick={run} data-act="run"><Play size={15} aria-hidden="true" />Run it</ActButton>}
      </div>
      <div className="work-body">
        <Html html={m.text} />
        {m.sql && <Editor value={code} onChange={setCode} onRun={run} label={`Mistake ${i + 1} SQL`} />}
        <Out n={r.n}>{r.out ?? shown}</Out>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ exercise and practical
interface ExProps {
  mod: Module;
  /** Lesson whose database state the exercise uses. */
  idx: number;
  e: Exercise | Practical;
  title: string;
  /** Called after a pass, e.g. to record the checkpoint practical. */
  onPass?: () => void;
  extraHead?: ReactNode;
  footer?: ReactNode;
  domId?: string;
}

export function ExerciseCard({ mod, idx, e, title, onPass, extraHead, footer, domId }: ExProps) {
  const { engine, P, setP, toast } = useApp();
  const isJs = e.check === 'js', manual = e.check === 'manual';
  const saved = P.drafts[e.id];
  const [code, setCodeState] = useState<string>(typeof saved === 'string' ? saved : (isJs ? e.jsStarter : e.starter) ?? '');
  const setCode = (v: string) => { setCodeState(v); setP('drafts', e.id, v); };
  const [showSol, setShowSol] = useState(false);
  const r = useRunner();
  const state = exerciseState(P, e.id);
  const tried = !!P.drafts[e.id + ':tried'] || state === 'passed';
  const solution = e.solution || e.jsSolution || '';

  const markTried = () => { if (!P.drafts[e.id + ':tried']) setP('drafts', e.id + ':tried', true); };
  const pass = () => {
    if (!P.ex[e.id]) { setP('ex', e.id, true); toast(`${title} passed.`, 'ok'); }
    onPass?.();
  };

  const run = r.go('run', async () => {
    if (!code.trim()) return <Feedback tone="info">{isJs ? 'Write some code first.' : 'Write a query first.'}</Feedback>;
    if (isJs) {
      try { return <><ResLabel>Your output</ResLabel><Logs {...await engine.runJs(mod, idx, code)} /></>; }
      catch (err) { return <Feedback tone="err" title="Error:">{msg(err)}</Feedback>; }
    }
    try {
      const { t, v } = await engine.runExercise(mod, idx, code, e.verify);
      return <><ResLabel>Your output</ResLabel><ResultTable t={t} />{e.verify && <><ResLabel>After your change, the check query shows</ResLabel><ResultTable t={v} /></>}</>;
    } catch (err) { return pgError(err); }
  });

  const check = r.go('check', async () => {
    markTried();
    if (manual) {
      setShowSol(true); setP('revealed', e.id, true);
      return <Feedback tone="info" title="Check it yourself.">There is no automatic check for this one. Compare the model answer below with yours, point by point.</Feedback>;
    }
    if (!code.trim()) return <Feedback tone="info">{isJs ? 'Write some code first.' : 'Write a query first.'}</Feedback>;
    if (isJs) {
      try {
        const res = await engine.checkJs(mod, idx, code, solution);
        if (res.mine.blocked) return <Logs {...res.mine} />;
        if (res.pass) { pass(); return <><Feedback tone="ok" title="Correct.">Your output matches the model answer.</Feedback><Logs {...res.mine} /></>; }
        return <><Feedback tone="warn" title="Not yet.">{res.why}</Feedback><ResLabel>Your output</ResLabel><Logs {...res.mine} /></>;
      } catch (err) { return <Feedback tone="err" title="Error:">{msg(err)}</Feedback>; }
    }
    try {
      const { problem, got } = await engine.checkExercise(mod, idx, code, solution, e.check, e.verify);
      if (!problem) { pass(); return <><Feedback tone="ok" title="Correct.">Your result matches the model answer.</Feedback><ResultTable t={got} max={10} /></>; }
      return <><Feedback tone="warn" title="Not yet.">{problem}</Feedback><ResLabel>Your output</ResLabel><ResultTable t={got} max={10} /></>;
    } catch (err) { return pgError(err); }
  });

  const hint = () => { if ('hint' in e && e.hint) r.setOut(<Feedback tone="info" title="Hint:">{e.hint}</Feedback>); };
  const toggleSol = () => {
    const next = !showSol;
    setShowSol(next);
    if (next && state !== 'passed' && !P.revealed[e.id]) setP('revealed', e.id, true);
  };

  const prompt = e.prompt;
  return (
    <div className="work-card" data-split="true" data-exid={e.id} id={domId} data-state={state}>
      <div className="work-head">
        <span className="mp-eyebrow">{isJs ? <Code size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}{title}</span>
        <span className="mp-chip" data-tone="muted">{manual ? 'You check this one' : isJs ? 'JavaScript' : 'SQL'}</span>
        {'level' in e && e.level && <span className="mp-chip" data-tone="muted">{e.level}</span>}
        <span className="grow" />
        {extraHead}
        {!manual && <StatusChip state={state} />}
      </div>
      <div className="work-body">
        <div className="work-prompt"><Html html={prompt} /></div>
        <div className="work-side">
          <Editor value={code} onChange={setCode} onRun={run} label={`${title} ${isJs ? 'code' : 'SQL'} editor`} />
          <div className="btn-row">
            <ActButton className="btn-primary" busy={r.busy === 'check'} onClick={check} data-act="check"><ListChecks size={16} aria-hidden="true" />{manual ? 'Compare with the model answer' : 'Check answer'}</ActButton>
            <ActButton busy={r.busy === 'run'} onClick={run} data-act="run"><Play size={16} aria-hidden="true" />{isJs ? 'Run code' : 'Run query'}</ActButton>
            {'hint' in e && e.hint && <button type="button" className="btn-ghost" onClick={hint} data-act="hint"><Lightbulb size={16} aria-hidden="true" />Hint</button>}
            <button type="button" className="btn-ghost" data-act="sol" onClick={toggleSol} disabled={!tried && !showSol} aria-expanded={showSol}
              title={!tried ? 'Available after your first check' : undefined}>
              {showSol ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{showSol ? 'Hide model answer' : 'Show model answer'}
            </button>
          </div>
          {!tried && <p className="editor-hint">The model answer unlocks after your first check.</p>}
          <Out n={r.n}>{r.out}</Out>
          {showSol && (
            <div className="solution mp-fade-in">
              <ResLabel>Model answer (other correct answers exist)</ResLabel>
              <pre><code>{solution}</code></pre>
              {isJs && e.expectedLogs ? <><ResLabel>Its output</ResLabel><Logs logs={e.expectedLogs} /></>
                : e.expected ? <><ResLabel>Its result</ResLabel><ResultTable t={e.expected as Table} max={10} /></> : null}
              {state !== 'passed' && !manual && <p className="editor-hint" style={{ marginTop: 'var(--space-3)' }}>Viewing the answer does not count as passing. Write it yourself and check again.</p>}
            </div>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}

export type { JsResult };
