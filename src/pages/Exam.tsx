// Final exam: rules and name, the timed exam with autosave, and the result per module.
// Questions come from Supabase without answers; grading happens there too (see src/lib/exam.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Award, Clock, GraduationCap, Lock, Play, RotateCcw } from 'lucide-react';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { Editor } from '@/components/Editor';
import { Html } from '@/components/Html';
import { ActButton, Feedback, ResultTable } from '@/components/ui';
import {
  answered, examReadiness, fmtDateTime, loadExamState, saveAnswers, saveFullName, startExam, submitExam,
  type Answer, type ExamAttempt, type ExamQuestion, type ExamResult,
} from '@/lib/exam';
import type { Module, ResultTable as Table } from '@/lib/types';

type State = Awaited<ReturnType<typeof loadExamState>>;

/** The exam's practice database: the plain course dataset, the same data the course uses. */
const EXAM_MODULE = { id: 'exam', num: 'exam', title: 'Final exam', kind: 'core', hours: 0, setup: 'dataset', summary: '', objectives: [],
  lessons: [{ id: 'exam', num: '', title: 'Final exam', minutes: 0, goal: '', explain: '', examples: [], mistakes: [], exercises: [] }] } as unknown as Module;

const backupKey = (id: string) => `coursify:exam:${id}`;

export function ExamPage() {
  const { meta } = useApp();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);

  const reload = useCallback(() => {
    setError(null);
    loadExamState(meta.id).then(setState).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [meta.id]);
  useEffect(reload, [reload, attemptNo]);

  if (attempt && !result) return <RunningExam attempt={attempt} onDone={r => { setResult(r); setAttempt(null); }} />;
  return (
    <>
      <header className="hero exam-hero">
        <div className="mp-eyebrow">{meta.title}</div>
        <h1 tabIndex={-1}>Final exam</h1>
        <p className="lead">One exam over the whole course. Pass it and you get a certificate with a code anyone can check.</p>
      </header>
      {error && <div className="banner" data-tone="err" role="alert"><div><strong>The exam could not load.</strong>{error} <button type="button" className="btn-ghost btn-sm" onClick={reload}>Try again</button></div></div>}
      {!state && !error && <p className="muted"><span className="spinner" aria-hidden="true" /> Loading the exam…</p>}
      {result && <ResultView result={result} onRetakeInfo={() => { setResult(null); setAttemptNo(n => n + 1); }} />}
      {state && !result && <ExamIntro state={state} onStart={setAttempt} />}
    </>
  );
}

function ExamIntro({ state, onStart }: { state: State; onStart: (a: ExamAttempt) => void }) {
  const { meta, course, P } = useApp();
  const { session } = useAuth();
  const [name, setName] = useState(state.fullName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { settings, certificate, attempts } = state;
  const readiness = examReadiness(course, P);
  const open = attempts.find(a => !a.submitted_at && new Date(a.deadline).getTime() > Date.now());
  const lastDone = attempts.find(a => a.submitted_at);
  const retakeAt = settings && lastDone && !lastDone.passed
    ? new Date(new Date(lastDone.submitted_at!).getTime() + settings.cooldown_hours * 3600_000) : null;
  const waiting = retakeAt && retakeAt.getTime() > Date.now();

  if (!settings) return <Feedback tone="info" pop={false}>This course has no final exam yet.</Feedback>;
  if (certificate) return (
    <div className="card exam-card">
      <div className="exam-state" data-tone="ok"><Award size={22} aria-hidden="true" /><div>
        <h2>You passed with {certificate.score}%</h2>
        <p className="muted">Your certificate for {certificate.course_title} is ready.</p></div></div>
      <a className="btn-primary" href="#certificate"><Award size={16} aria-hidden="true" />View your certificate</a>
    </div>
  );

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      if (!open) {
        if (name.trim().length < 2) throw new Error('Enter your full name as it should appear on the certificate.');
        await saveFullName(session!.user.id, name);
      }
      onStart(await startExam(meta.id));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="exam-intro">
      <section className="card exam-card">
        <h2>How the exam works</h2>
        <ul className="ticks">
          <li><strong>{settings.questions_per_topic * course.modules.filter(m => m.kind === 'core').length} questions</strong>, {settings.questions_per_topic} from every module, drawn at random. They are new: none of them appear in the lessons or checkpoints.</li>
          <li>Some questions ask you to <strong>query the practice database</strong> and enter the result, so they test whether you can write the SQL, not only recognise it.</li>
          <li><strong>{settings.time_limit_minutes} minutes.</strong> Your answers are saved as you go; when time runs out, what you saved is handed in.</li>
          <li>You pass with <strong>{settings.pass_percent}%</strong> or more. Not this time? You can try again after {settings.cooldown_hours} hours, with different questions.</li>
          <li>Work on your own and without AI tools: the certificate says you can do this yourself.</li>
        </ul>
      </section>

      {!readiness.ready ? (
        <section className="card exam-card">
          <div className="exam-state" data-tone="muted"><Lock size={20} aria-hidden="true" /><div>
            <h2>Finish the course first</h2>
            <p className="muted">The exam opens when every module's checkpoint is passed. Still to do:</p></div></div>
          <ul className="exam-missing">{readiness.missing.map(m => <li key={m.id}><a href={`#${m.id}-cp`}>Module {m.num} · {m.title}</a></li>)}</ul>
        </section>
      ) : waiting ? (
        <section className="card exam-card">
          <div className="exam-state" data-tone="warn"><Clock size={20} aria-hidden="true" /><div>
            <h2>Your last attempt scored {lastDone!.score}%</h2>
            <p className="muted">You can retake the exam from {fmtDateTime(retakeAt!.toISOString())}. Use the time on the modules where you lost points:</p></div></div>
          <TopicBars breakdown={lastDone!.breakdown ?? []} />
        </section>
      ) : (
        <section className="card exam-card">
          {open ? (
            <p>You have an exam in progress until {fmtDateTime(open.deadline)}. Your saved answers are still there.</p>
          ) : (
            <label className="auth-field exam-name">
              <span>Your full name, as it should appear on the certificate</span>
              <input className="input" id="exam-full-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
            </label>
          )}
          {err && <p className="auth-msg" data-tone="err" role="alert">{err}</p>}
          <ActButton className="btn-primary" busy={busy} onClick={start}><Play size={16} aria-hidden="true" />{open ? 'Continue the exam' : 'Start the exam'}</ActButton>
        </section>
      )}

      {attempts.some(a => a.submitted_at) && (
        <section className="card exam-card">
          <h2>Earlier attempts</h2>
          <table className="exam-history"><thead><tr><th>Date</th><th>Score</th><th>Result</th></tr></thead>
            <tbody>{attempts.filter(a => a.submitted_at).map(a => (
              <tr key={a.id}><td>{fmtDateTime(a.submitted_at!)}</td><td>{a.score}%</td><td>{a.passed ? 'Passed' : 'Not passed'}</td></tr>
            ))}</tbody></table>
        </section>
      )}
    </div>
  );
}

function useCountdown(deadline: string) {
  const end = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const [left, setLeft] = useState(() => end - Date.now());
  useEffect(() => { const t = setInterval(() => setLeft(end - Date.now()), 1000); return () => clearInterval(t); }, [end]);
  return Math.max(0, left);
}

function RunningExam({ attempt, onDone }: { attempt: ExamAttempt; onDone: (r: ExamResult) => void }) {
  const { confirm, toast } = useApp();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    try { return { ...attempt.answers, ...JSON.parse(sessionStorage.getItem(backupKey(attempt.attempt_id)) || '{}') }; }
    catch { return { ...attempt.answers }; }
  });
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [submitting, setSubmitting] = useState(false);
  const left = useCountdown(attempt.deadline);
  const latest = useRef(answers);
  const first = useRef(true);

  // Keep a copy in this tab at once, and save to the account a moment after the last change.
  useEffect(() => {
    latest.current = answers;
    try { sessionStorage.setItem(backupKey(attempt.attempt_id), JSON.stringify(answers)); } catch { /* the account copy is what counts */ }
    if (first.current) { first.current = false; return; }
    setSaveState('saving');
    const t = setTimeout(() => {
      saveAnswers(attempt.attempt_id, answers).then(() => setSaveState('saved')).catch(() => setSaveState('failed'));
    }, 1200);
    return () => clearTimeout(t);
  }, [answers, attempt.attempt_id]);

  const submit = useCallback(async (auto = false) => {
    if (submitting) return;
    const open = attempt.questions.filter(q => !answered(latest.current[q.id])).length;
    if (!auto && !(await confirm('Hand in the exam?', open ? `${open} question(s) are still unanswered and will count as wrong.` : 'You can’t change your answers after this.', 'Hand in'))) return;
    setSubmitting(true);
    try {
      const r = await submitExam(attempt.attempt_id, latest.current);
      try { sessionStorage.removeItem(backupKey(attempt.attempt_id)); } catch { /* fine */ }
      window.scrollTo(0, 0);
      onDone(r);
    } catch (e) {
      toast(`The exam could not be handed in: ${e instanceof Error ? e.message : String(e)} Your answers are saved; try again.`, 'err');
      setSubmitting(false);
    }
  }, [attempt, confirm, onDone, submitting, toast]);

  useEffect(() => { if (left === 0) void submit(true); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, a: Answer | undefined) => setAnswers(prev => {
    const n = { ...prev }; if (a === undefined) delete n[id]; else n[id] = a; return n;
  });
  const done = attempt.questions.filter(q => answered(answers[q.id])).length;
  const mins = Math.floor(left / 60000), secs = Math.floor((left % 60000) / 1000);
  let lastTopic = '';

  return (
    <div className="exam-run">
      <div className="exam-bar" role="status">
        <span className="exam-timer" data-low={left < 5 * 60000}><Clock size={16} aria-hidden="true" />{mins}:{String(secs).padStart(2, '0')} left</span>
        <span>{done} of {attempt.questions.length} answered</span>
        <span className="muted small">{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved yet, retrying with your next answer' : 'All answers saved'}</span>
        <span className="grow" />
        <ActButton className="btn-primary btn-sm" busy={submitting} onClick={() => void submit()}>Hand in</ActButton>
      </div>
      <h1 tabIndex={-1} className="sr-only">Final exam</h1>
      <ol className="exam-questions">
        {attempt.questions.map((q, i) => {
          const head = q.topic !== lastTopic ? q.topic_title : null; lastTopic = q.topic;
          return (
            <li key={q.id} className="exam-q-wrap">
              {head && <div className="exam-topic">{head}</div>}
              <Question q={q} n={i + 1} value={answers[q.id]} onChange={a => set(q.id, a)} />
            </li>
          );
        })}
      </ol>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <ActButton className="btn-primary" busy={submitting} onClick={() => void submit()}>Hand in the exam</ActButton>
      </div>
    </div>
  );
}

function Question({ q, n, value, onChange }: { q: ExamQuestion; n: number; value: Answer | undefined; onChange: (a: Answer | undefined) => void }) {
  const name = `q-${q.id}`;
  return (
    <fieldset className="card exam-q" data-qid={q.id}>
      <legend className="sr-only">Question {n}</legend>
      <div className="exam-q-head"><span className="lesson-num">{n}</span>
        <span className="mp-chip" data-tone="muted">{q.kind === 'multi' ? 'Select all that apply' : q.kind === 'value' ? 'Query and enter the result' : 'One answer'}</span></div>
      <Html html={q.prompt} className="exam-prompt" />
      {q.kind === 'single' && q.options.map((o, i) => (
        <label key={i} className="exam-opt"><input type="radio" name={name} value={i} checked={value === i} onChange={() => onChange(i)} /><span dangerouslySetInnerHTML={{ __html: o }} /></label>
      ))}
      {q.kind === 'multi' && q.options.map((o, i) => {
        const sel = Array.isArray(value) ? value : [];
        return (
          <label key={i} className="exam-opt"><input type="checkbox" name={name} value={i} checked={sel.includes(i)}
            onChange={e => { const next = e.target.checked ? [...sel, i].sort((a, b) => a - b) : sel.filter(x => x !== i); onChange(next.length ? next : undefined); }} />
            <span dangerouslySetInnerHTML={{ __html: o }} /></label>
        );
      })}
      {q.kind === 'value' && <>
        <label className="auth-field exam-value"><span>Your answer</span>
          <input className="input" inputMode="decimal" name={name} value={typeof value === 'string' ? value : ''} placeholder="e.g. 1234.56"
            onChange={e => onChange(e.target.value === '' ? undefined : e.target.value)} /></label>
        <Scratchpad id={q.id} />
      </>}
    </fieldset>
  );
}

/** A query box on the plain course dataset. Nothing here is graded: only the number you enter counts. */
function Scratchpad({ id }: { id: string }) {
  const { engine, status } = useApp();
  const [code, setCode] = useState('SELECT ');
  const [out, setOut] = useState<Table | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setOut((await engine.runExercise(EXAM_MODULE, 0, code)).t); }
    catch (e) { setOut(null); setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <details className="exam-scratch">
      <summary>Practice database for this question</summary>
      <Editor value={code} onChange={setCode} onRun={run} label={`SQL for question ${id}`} />
      <div className="btn-row"><ActButton busy={busy} onClick={run} disabled={status.state === 'unavailable'}><Play size={15} aria-hidden="true" />Run</ActButton>
        <span className="muted small">Changes are undone after every run.</span></div>
      {err && <Feedback tone="err" pop={false}>{err}</Feedback>}
      <ResultTable t={out} max={20} />
    </details>
  );
}

function TopicBars({ breakdown }: { breakdown: { topic: string; title: string; correct: number; total: number }[] }) {
  return (
    <ul className="exam-topics">
      {breakdown.map(t => {
        const pct = t.total ? Math.round((100 * t.correct) / t.total) : 0;
        return (
          <li key={t.topic} data-weak={t.correct < t.total}>
            <a href={'#' + t.topic}>{t.title}</a>
            <div className="progress-bar" aria-hidden="true"><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
            <span className="small">{t.correct} of {t.total}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultView({ result, onRetakeInfo }: { result: ExamResult; onRetakeInfo: () => void }) {
  const weak = result.breakdown.filter(t => t.correct < t.total);
  return (
    <section className="card exam-card exam-result" data-passed={result.passed}>
      <div className="exam-state" data-tone={result.passed ? 'ok' : 'warn'}>
        {result.passed ? <GraduationCap size={26} aria-hidden="true" /> : <RotateCcw size={22} aria-hidden="true" />}
        <div>
          <h2>{result.passed ? `Passed with ${result.score}%` : `${result.score}%: not passed yet`}</h2>
          <p className="muted">{result.correct} of {result.total} correct · {result.pass_percent}% needed to pass.</p>
        </div>
      </div>
      {result.passed
        ? <a className="btn-primary" href="#certificate"><Award size={16} aria-hidden="true" />View your certificate</a>
        : <p>You can try again from {result.retake_after ? fmtDateTime(result.retake_after) : 'later'}, with new questions. {weak.length ? 'Review the modules below first.' : ''}</p>}
      <h3>Per module</h3>
      <TopicBars breakdown={result.breakdown} />
      {!result.passed && <button type="button" className="btn-secondary" onClick={onRetakeInfo}>Back to the exam page</button>}
    </section>
  );
}
