// Checkpoint: multiple-choice quiz (pass at 70%, best attempt counts), predict-and-write items,
// and a timed practical. Rules unchanged from the original course.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Clock, ListChecks, Play } from 'lucide-react';
import { Banners } from '@/components/Banners';
import { Editor } from '@/components/Editor';
import { Html } from '@/components/Html';
import { ExerciseCard } from '@/components/Work';
import { ActButton, Feedback, ResLabel, ResultTable, Reveal } from '@/components/ui';
import { QUIZ_PASS_PERCENT } from '@/lib/course-progress';
import { stripP, stripTags } from '@/lib/inline';
import type { Module, QuizItem } from '@/lib/types';
import { useApp } from '@/state/app';

function Head({ n, id, title, lead }: { n: number; id: string; title: string; lead?: string }) {
  return (
    <div className="section-head">
      <span className="mp-chapter-number" aria-hidden="true">{String(n).padStart(2, '0')}</span>
      <h2 id={id} tabIndex={-1}>{title}</h2>
      {lead && <p className="muted">{lead}</p>}
    </div>
  );
}

function McQuiz({ mod, qs }: { mod: Module; qs: QuizItem[] }) {
  const { P, setP } = useApp();
  const [choice, setChoice] = useState<Record<string, number | undefined>>(() => Object.fromEntries(qs.map(q => [q.id, P.quiz[q.id]?.choice])));
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ pct: number; right: number } | { missing: true } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (result) resultRef.current?.scrollIntoView({ block: 'nearest' }); }, [result]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (qs.some(q => choice[q.id] === undefined)) { setResult({ missing: true }); return; }
    let right = 0;
    for (const q of qs) {
      const ok = !!q.options![choice[q.id]!].correct;
      if (ok) right++;
      setP('quiz', q.id, { choice: choice[q.id], correct: ok });
    }
    const pct = Math.round((right / qs.length) * 100), passed = pct >= QUIZ_PASS_PERCENT;
    const best = P.quizBest[mod.id];
    if (!best || pct > best.score) setP('quizBest', mod.id, { score: pct, passed });
    setSubmitted(true);
    setResult({ pct, right });
  };
  const retry = () => { setChoice({}); setSubmitted(false); setResult(null); document.querySelector<HTMLInputElement>('#quizform input')?.focus(); };

  return (
    <form id="quizform" noValidate onSubmit={submit} className="card">
      {qs.map((q, qi) => {
        const good = q.options!.findIndex(o => o.correct), pick = choice[q.id];
        return (
          <fieldset className="quiz-q" key={q.id} data-q={q.id}>
            <legend dangerouslySetInnerHTML={{ __html: `${qi + 1}. ${stripP(q.text)}` }} />
            <div className="quiz-opts">
              {q.options!.map((o, oi) => (
                <label key={oi} className={`quiz-option${submitted && oi === good ? ' correct' : ''}${submitted && pick === oi && oi !== good ? ' incorrect' : ''}`}>
                  <input type="radio" name={q.id} value={oi} checked={pick === oi} disabled={submitted} onChange={() => setChoice(c => ({ ...c, [q.id]: oi }))} />
                  <span dangerouslySetInnerHTML={{ __html: stripP(o.text) }} />
                </label>
              ))}
            </div>
            <div aria-live="polite">
              {submitted && pick !== undefined && (pick === good
                ? <Feedback tone="ok" title="Correct." html={q.explain ? stripP(q.explain) : ''} />
                : <Feedback tone="err" title={'Correct answer: ' + stripTags(stripP(q.options![good].text))} html={q.explain ? stripP(q.explain) : ''} />)}
            </div>
          </fieldset>
        );
      })}
      <div className="btn-row" style={{ marginTop: 'var(--space-6)' }}>
        {!submitted && <button type="submit" className="btn-primary"><ListChecks size={16} aria-hidden="true" />Submit answers</button>}
        {submitted && <button type="button" className="btn-secondary" onClick={retry}>Try again</button>}
      </div>
      <div ref={resultRef} role="status" aria-live="polite" id="quizresult" style={{ marginTop: result ? 'var(--space-5)' : 0 }}>
        {result && 'missing' in result && <Feedback tone="info">Answer all {qs.length} questions first.</Feedback>}
        {result && 'pct' in result && (
          <div className={`score${result.pct >= QUIZ_PASS_PERCENT ? ' mp-pop' : ' mp-fade-in'}`}>
            <div className="score-ring" style={{ ['--p' as string]: result.pct, ['--ring' as string]: result.pct >= QUIZ_PASS_PERCENT ? 'var(--success)' : 'var(--warning)' }}><span>{result.pct}%</span></div>
            <div>
              <strong style={{ fontSize: 'var(--text-lg)' }}>{result.pct >= QUIZ_PASS_PERCENT ? 'Passed.' : 'Not passed yet.'}</strong>
              <p className="muted">{result.right} of {qs.length} correct. {result.pct >= QUIZ_PASS_PERCENT ? 'Well done.' : 'Read the feedback above, review the lessons behind the misses, and try again.'}</p>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

function PredictOrWrite({ mod, q }: { mod: Module; q: QuizItem }) {
  const { engine, P, setP } = useApp();
  const last = mod.lessons.length - 1;
  const [text, setText] = useState(() => (typeof P.drafts[q.id] === 'string' ? (P.drafts[q.id] as string) : ''));
  const [out, setOut] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const st = P.quiz[q.id];
  const change = (v: string) => { setText(v); setP('drafts', q.id, v); };
  const act = (what: string, fn: () => Promise<React.ReactNode>) => async () => {
    if (busy) return;
    setBusy(what);
    try { setOut(await fn()); } catch (e) { setOut(<Feedback tone="err" title="Error:">{e instanceof Error ? e.message : String(e)}</Feedback>); }
    finally { setBusy(null); setN(x => x + 1); }
  };
  const badge = st?.revealed ? <span className="mp-chip" data-tone="muted">Answer revealed</span>
    : st ? <span className="mp-chip" data-tone={st.correct ? 'ok' : 'warn'}>{st.correct ? 'Correct' : 'Not yet'}</span> : null;

  return (
    <div className="work-card" data-q={q.id} data-state={st?.correct && !st.revealed ? 'passed' : undefined} data-split={q.type === 'write' ? 'true' : undefined}>
      <div className="work-head"><span className="mp-eyebrow">{q.type === 'predict' ? 'Predict the output' : 'Write the query'}</span><span className="grow" />{badge}</div>
      <div className="work-body">
        <div className="work-prompt"><Html html={q.text} /></div>
        <div className="work-side">
          {q.type === 'predict' ? (
            <>
              <Editor plain value={text} onChange={change} label="Your prediction" placeholder="Write your prediction first" />
              <div className="btn-row"><button type="button" className="btn-secondary" data-act="reveal" onClick={() => {
                if (!text.trim()) { setOut(<Feedback tone="info">Write your prediction first. Guessing before you look is the point.</Feedback>); setN(x => x + 1); return; }
                // Revealing is recorded as revealed, not as correct: the learner judges their own prediction.
                setP('quiz', q.id, { correct: false, revealed: true });
                setOut(<>
                  <Feedback tone="info" title="Answer:">{(q.answer ?? '').replace(/`/g, '')}</Feedback>
                  {q.predictOutput ? <><ResLabel>What the database returns</ResLabel><ResultTable t={q.predictOutput} max={10} /></> : q.predictError ? <Feedback tone="err" title="Error:" pop={false}>{q.predictError}</Feedback> : null}
                  {q.explain && <Feedback tone="info" title="Why" html={stripP(q.explain)} pop={false} />}
                  <p className="editor-hint">Compare it with what you wrote. Where did your prediction differ, and why?</p>
                </>); setN(x => x + 1);
              }}>Reveal the answer</button></div>
            </>
          ) : (
            <>
              <Editor value={text} onChange={change} label="Your query" onRun={act('run', async () => <><ResLabel>Your output</ResLabel><ResultTable t={(await engine.runExercise(mod, last, text)).t} /></>)} />
              <div className="btn-row">
                <ActButton className="btn-primary" data-act="check" busy={busy === 'check'} onClick={act('check', async () => {
                  const { problem } = await engine.checkExercise(mod, last, text, q.solution!, q.check);
                  setP('quiz', q.id, { correct: !problem });
                  return <>
                    {problem ? <Feedback tone="warn" title="Not yet.">{problem}</Feedback> : <Feedback tone="ok" title="Correct.">Your result matches the model answer.</Feedback>}
                    <div className="solution"><ResLabel>Model answer</ResLabel><pre><code>{q.solution}</code></pre></div>
                  </>;
                })}><ListChecks size={16} aria-hidden="true" />Check answer</ActButton>
                <ActButton data-act="run" busy={busy === 'run'} onClick={act('run', async () => <><ResLabel>Your output</ResLabel><ResultTable t={(await engine.runExercise(mod, last, text)).t} /></>)}><Play size={16} aria-hidden="true" />Run query</ActButton>
              </div>
            </>
          )}
          <div className="res fb-wrap" aria-live="polite">{out && <div key={n} className="res-enter fb-wrap">{out}</div>}</div>
        </div>
      </div>
    </div>
  );
}

function Timer({ minutes }: { minutes: number }) {
  const { toast } = useApp();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => {
      setLeft(left - 1);
      if (left - 1 === 0) toast('Time is up. Finish your sentence, then check.');
    }, 1000);
    return () => clearTimeout(t);
  }, [left, toast]);
  const s = left ?? minutes * 60;
  return (
    <>
      <span className="timer mp-chip" data-tone={left === 0 ? 'warn' : 'muted'} id="timer" aria-live={left !== null && left % 60 === 0 ? 'polite' : 'off'}>
        <Clock size={14} aria-hidden="true" />{left === 0 ? 'Time is up' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
      </span>
      <button type="button" className="btn-secondary btn-sm" id="tstart" onClick={() => setLeft(minutes * 60)}>{left === null ? 'Start timer' : 'Restart timer'}</button>
    </>
  );
}

export function CheckpointPage({ mod }: { mod: Module }) {
  const { course, P, setP } = useApp();
  const cp = mod.checkpoint!, last = mod.lessons.length - 1, pr = cp.practical;
  const mcs = cp.quiz.filter(q => q.type === 'mc'), others = cp.quiz.filter(q => q.type !== 'mc');
  const best = P.quizBest[mod.id];
  const nm = course.modules[course.modules.indexOf(mod) + 1];
  let n = 0;
  return (
    <>
      <header className="hero">
        <a className="crumb" href={'#' + mod.id}><ChevronLeft size={16} aria-hidden="true" />Module {mod.num} · {mod.title}</a>
        <h1 tabIndex={-1}><span className="hero-num">✓</span>Checkpoint</h1>
        <p className="lead">First the quiz, without notes. Then the practical task: documentation is allowed, AI that writes the answer is not.</p>
        <div className="hero-meta">
          {mcs.length > 0 && <span className="mp-chip">{mcs.length} quiz questions · pass at {QUIZ_PASS_PERCENT}%</span>}
          {others.length > 0 && <span className="mp-chip" data-tone="muted">{others.length} predict-and-write</span>}
          {pr && <span className="mp-chip" data-tone="muted">Practical ≈ {pr.minutes} min</span>}
          {best && <span className="mp-chip" data-tone={best.passed ? 'ok' : 'warn'}>Best quiz score {best.score}%</span>}
        </div>
      </header>
      <Banners />
      {cp.intro && <div style={{ marginTop: 'var(--space-6)' }}><Feedback tone="info" pop={false}><Html html={cp.intro} className="prose" /></Feedback></div>}

      {mcs.length > 0 && (
        <section className="section" id="quiz" aria-labelledby="quiz-h">
          <Head n={++n} id="quiz-h" title="Quiz" lead={`${mcs.length} questions · you pass at ${QUIZ_PASS_PERCENT}% · feedback on every answer · your best attempt counts.`} />
          <McQuiz mod={mod} qs={mcs} />
        </section>
      )}
      {others.length > 0 && (
        <section className="section" aria-labelledby="pw-h">
          <Head n={++n} id="pw-h" title="Predict and write" />
          {others.map(q => <Reveal key={q.id}><PredictOrWrite mod={mod} q={q} /></Reveal>)}
        </section>
      )}
      {pr && (
        <section className="section" aria-labelledby="pr-h">
          <Head n={++n} id="pr-h" title="Practical task" lead="You pass when the check is green and you can explain your approach in three sentences in your notes." />
          <ExerciseCard mod={mod} idx={last} e={pr} title="Practical" domId="prac"
            onPass={() => { if (!P.practical[pr.id]) setP('practical', pr.id, true); }}
            extraHead={<Timer minutes={pr.minutes} />} />
        </section>
      )}

      <div className="band">
        <div><p className="mp-eyebrow" style={{ color: 'var(--color-inverse-eyebrow)' }}>Module {mod.num}</p>
          <h2>{pr && P.practical[pr.id] ? 'Module completed.' : 'Checkpoint'}</h2>
          <p>{nm ? `Next: Module ${nm.num}, ${nm.title}.` : 'This is the last module.'}</p></div>
        <div className="btn-row">
          {nm && <a className="btn-primary" href={'#' + nm.id}>Module {nm.num}: {nm.title}<ArrowRight size={16} aria-hidden="true" /></a>}
          <a className="btn-secondary" href={'#' + (mod.lessons[last]?.id || mod.id)}><ChevronLeft size={16} aria-hidden="true" />Last lesson</a>
        </div>
      </div>
    </>
  );
}
