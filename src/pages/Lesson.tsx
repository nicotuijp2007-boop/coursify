import { ArrowRight, ArrowUp, Check, ChevronLeft, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Html } from '@/components/Html';
import { ExampleCard, ExerciseCard, MistakeCard } from '@/components/Work';
import { Banners } from '@/components/Banners';
import { Feedback, Reveal } from '@/components/ui';
import { lessonProgress } from '@/lib/course-progress';
import type { Lesson, Module } from '@/lib/types';
import { useApp } from '@/state/app';

/** Sections of a lesson page, in order. Also drives the sidebar's in-lesson navigation. */
export function lessonSections(L: Lesson): { id: string; label: string }[] {
  return [
    { id: 'h-explain', label: 'Explanation' },
    L.examples.length ? { id: 'h-ex', label: 'Worked examples' } : null,
    L.mistakes.length ? { id: 'h-mis', label: 'Common mistakes' } : null,
    { id: 'h-exc', label: 'Exercises' },
    L.project ? { id: 'h-proj', label: 'Your app' } : null,
    { id: 'h-sum', label: 'In short' },
  ].filter(Boolean) as { id: string; label: string }[];
}

function Section({ id, n, title, lead, children }: { id: string; n: number; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="section" id={id} aria-labelledby={id + '-t'}>
      <div className="section-head">
        <span className="mp-chapter-number" aria-hidden="true">{String(n).padStart(2, '0')}</span>
        <h2 id={id + '-t'} tabIndex={-1}>{title}</h2>
        {lead && <p className="muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export function LessonPage({ mod, idx }: { mod: Module; idx: number }) {
  const { course, P, setP, toast } = useApp();
  const L = mod.lessons[idx];
  const prev = idx > 0 ? mod.lessons[idx - 1] : null;
  const nextId = idx < mod.lessons.length - 1 ? mod.lessons[idx + 1].id : mod.checkpoint ? mod.id + '-cp' : null;
  const nextTitle = idx < mod.lessons.length - 1 ? `${mod.lessons[idx + 1].num} ${mod.lessons[idx + 1].title}` : 'Checkpoint';
  const done = !!P.lessons[L.id];
  const prog = lessonProgress(course, P, L);
  const sections = lessonSections(L);
  const num = (id: string) => sections.findIndex(s => s.id === id) + 1;
  const toggleDone = () => {
    setP('lessons', L.id, done ? undefined : true);
    if (!done) toast('Lesson marked as done.', 'ok');
  };

  return (
    <article>
      <header className="hero">
        <a className="crumb" href={'#' + mod.id}><ChevronLeft size={16} aria-hidden="true" />Module {mod.num} · {mod.title}</a>
        <h1 tabIndex={-1}><span className="hero-num">{L.num}</span>{L.title}</h1>
        <p className="lead">{L.goal}</p>
        <div className="hero-meta">
          <span className="mp-chip"><Clock size={14} aria-hidden="true" />≈ {L.minutes} min</span>
          <span className="mp-chip" data-tone="muted">{L.examples.length} examples</span>
          <span className="mp-chip" data-tone="muted">{L.exercises.length} exercises</span>
          {prog.total > 0 && <span className="mp-chip" data-tone={prog.done === prog.total ? 'ok' : 'muted'}>{prog.done} of {prog.total} checked</span>}
          {done && <span className="mp-chip" data-tone="ok"><Check size={14} aria-hidden="true" />Done</span>}
        </div>
      </header>
      <Banners />

      <Section id="h-explain" n={num('h-explain')} title="Explanation"><Html html={L.explain} /></Section>

      {L.examples.length > 0 && (
        <Section id="h-ex" n={num('h-ex')} title="Worked examples" lead="Run each example in order: later examples and exercises build on what earlier examples create.">
          {L.examples.map((ex, i) => <Reveal key={i}><ExampleCard mod={mod} idx={idx} ex={ex} i={i} /></Reveal>)}
        </Section>
      )}

      {L.mistakes.length > 0 && (
        <Section id="h-mis" n={num('h-mis')} title="Common mistakes">
          {L.mistakes.map((m, i) => <Reveal key={i}><MistakeCard mod={mod} idx={idx} m={m} i={i} /></Reveal>)}
        </Section>
      )}

      <Section id="h-exc" n={num('h-exc')} title="Exercises" lead={<>Write your answer, run it with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>, then check it. The model answer unlocks after your first check.</>}>
        {L.exercises.map((e, i) => <Reveal key={e.id}><ExerciseCard mod={mod} idx={idx} e={e} title={`Exercise ${i + 1}`} /></Reveal>)}
      </Section>

      {L.project && (
        <Section id="h-proj" n={num('h-proj')} title="Your app">
          <div className="work-card" id="proj" data-state={P.proj[L.id] ? 'passed' : undefined}>
            <div className="work-head"><span className="mp-eyebrow">Project checkpoint</span><span className="mp-chip" data-tone="muted">harbourline-recon</span></div>
            <div className="work-body">
              <Html html={L.project} />
              <label className="quiz-option" style={{ cursor: 'pointer' }}>
                <input type="checkbox" id="projcb" checked={!!P.proj[L.id]} onChange={e => setP('proj', L.id, e.target.checked || undefined)} />
                <span>I did this step in my own project, and it works.</span>
              </label>
              <div aria-live="polite">{P.proj[L.id] && <Feedback tone="ok" title="App step done.">Your app is ready for the next step. (This is your own report; the course cannot check your app.)</Feedback>}</div>
            </div>
          </div>
        </Section>
      )}

      <Section id="h-sum" n={num('h-sum')} title="In short">
        <div className="card">
          <ul className="ticks">{L.recap.map((r, i) => <li key={i}><span dangerouslySetInnerHTML={{ __html: r }} /></li>)}</ul>
          {L.docs.length > 0 && <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>Documentation: {L.docs.map((d, i) => <span key={i}>{i > 0 && ' · '}<a href={d.url} target="_blank" rel="noopener">{d.label}</a></span>)}</p>}
        </div>
      </Section>

      <div className="band">
        <div>
          <p className="mp-eyebrow" style={{ color: 'var(--color-inverse-eyebrow)' }}>Lesson {L.num}</p>
          <h2>{done ? 'Lesson done.' : 'Finished reading and practising?'}</h2>
          <p>{done ? (nextId ? `Next: ${nextTitle}.` : 'This was the last lesson of the module.') : 'Mark the lesson as done to keep your place. Exercises count on their own when you pass them.'}</p>
        </div>
        <div className="btn-row">
          <button type="button" className={done ? 'btn-secondary' : 'btn-primary'} onClick={toggleDone} data-act="done" aria-pressed={done}>
            {done ? <><Check size={16} aria-hidden="true" />Lesson done</> : 'Mark lesson as done'}
          </button>
          {nextId && <a className={done ? 'btn-primary' : 'btn-secondary'} href={'#' + nextId}>{nextId.endsWith('-cp') ? 'Go to checkpoint' : 'Next lesson'}<ArrowRight size={16} aria-hidden="true" /></a>}
          <a className="btn-secondary" href={'#' + (prev ? prev.id : mod.id)}><ChevronLeft size={16} aria-hidden="true" />{prev ? 'Previous lesson' : 'Module overview'}</a>
          <button type="button" className="btn-secondary" onClick={() => { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }}><ArrowUp size={16} aria-hidden="true" />Top</button>
        </div>
      </div>
    </article>
  );
}
