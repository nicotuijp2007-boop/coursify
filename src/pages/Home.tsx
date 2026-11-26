import { ArrowRight, GraduationCap, Lock, Play } from 'lucide-react';
import { examReadiness } from '@/lib/exam';
import { Banners } from '@/components/Banners';
import { Reveal } from '@/components/ui';
import { courseProgress, graded, moduleProgress, moduleStatus, nextLesson } from '@/lib/course-progress';
import { parseRoute } from '@/lib/route';
import { useApp } from '@/state/app';

const STATUS_LABEL = { 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Completed' } as const;

export function HomePage() {
  const { meta, course, P, engine } = useApp();
  const core = course.modules.filter(m => m.kind === 'core');
  const hours = core.reduce((a, m) => a + m.hours, 0);
  const allEx = course.modules.flatMap(m => m.lessons.flatMap(l => l.exercises.filter(graded)));
  const doneEx = allEx.filter(e => P.ex[e.id]).length;
  const lessons = course.modules.flatMap(m => m.lessons), doneL = lessons.filter(l => P.lessons[l.id]).length;
  const cps = course.modules.filter(m => m.checkpoint?.practical), doneCp = cps.filter(m => P.practical[m.checkpoint!.practical!.id]).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const total = courseProgress(course, P);
  // "Continue where you left off": the last lesson or checkpoint visited, else the first lesson not done.
  const last = P.last ? parseRoute(course, P.last) : null;
  const resume = last && (last.kind === 'lesson' || last.kind === 'checkpoint') ? last : null;
  const next = nextLesson(course, P);
  const started = doneL > 0 || !!resume;
  const target = resume ? resume.hash : started ? next.lesson.id : next.mod.id;
  const targetLabel = resume
    ? resume.kind === 'lesson' ? `${resume.mod.lessons[resume.idx].num} ${resume.mod.lessons[resume.idx].title}` : `Checkpoint ${resume.mod.num}`
    : started ? `${next.lesson.num} ${next.lesson.title}` : `Module ${next.mod.num}`;
  const stats = [
    [doneEx, allEx.length, 'exercises passed'],
    [doneL, lessons.length, 'lessons done'],
    [doneCp, cps.length, 'checkpoints passed'],
  ] as const;

  return (
    <>
      <header className="hero">
        <div className="mp-eyebrow">{meta.eyebrow} · {engine.version || 'PostgreSQL'}</div>
        <h1 tabIndex={-1}>{meta.title}</h1>
        <p className="lead">{meta.lead}</p>
        <div className="hero-meta">
          <span className="mp-chip">≈ {hours.toFixed(0)} hours</span>
          <span className="mp-chip" data-tone="muted">{course.modules.length} modules</span>
          {meta.pace && <span className="mp-chip" data-tone="muted">{meta.pace}</span>}
          <span className="mp-chip" data-tone="muted">Progress saved to your account</span>
        </div>
        <div className="grid-2" style={{ alignItems: 'end' }}>
          <div>
            <strong>After this course you can</strong>
            <ul className="ticks" style={{ marginTop: 'var(--space-2)' }}>
              {meta.outcomes.map(o => <li key={o}>{o}</li>)}
            </ul>
          </div>
          <div className="card" style={{ background: 'var(--brand-primary-50)', borderColor: 'transparent' }}>
            <p className="mp-eyebrow">{started ? 'Continue where you left off' : 'Start here'}</p>
            <p style={{ fontWeight: 600, margin: 'var(--space-1) 0 var(--space-4)', color: 'var(--heading)' }}>{targetLabel}</p>
            <a className="btn-primary" href={'#' + target}><Play size={16} aria-hidden="true" />{started ? 'Continue' : 'Start the course'}</a>
          </div>
        </div>
      </header>
      <Banners />

      <div className="stats">
        {stats.map(([a, b, l], i) => (
          <Reveal key={l} delay={i * 70} className="stat">
            <div className="v">{a} <small>of {b}</small></div><div className="l">{l}</div>
            <div className="progress-bar" aria-hidden="true"><div className="progress-bar-fill" style={{ width: pct(a, b) + '%' }} /></div>
          </Reveal>
        ))}
        <Reveal delay={210} className="stat">
          <div className="v">{total.pct}%</div><div className="l">of the course done</div>
          <div className="progress-bar" aria-hidden="true"><div className="progress-bar-fill" style={{ width: total.pct + '%' }} /></div>
        </Reveal>
      </div>

      <section className="section" aria-labelledby="mods-h">
        <div className="section-head" style={{ gridTemplateColumns: '1fr' }}><h2 id="mods-h">Modules</h2></div>
        <div className="mod-grid">
          {course.modules.map((m, i) => {
            const p = moduleProgress(course, P, m), st = moduleStatus(course, P, m);
            return (
              <Reveal key={m.id} delay={(i % 3) * 60}>
                <a className={`card module-card mod-card ${st}`} href={'#' + m.id}>
                  <div className="top">
                    <span className="lesson-num" data-done={st === 'completed'}>{m.num}</span>
                    <span className="mp-chip" data-tone={st === 'completed' ? 'ok' : st === 'in-progress' ? 'warn' : 'muted'}>{STATUS_LABEL[st]}</span>
                    {m.kind !== 'core' && <span className="mp-chip" data-tone="muted">Optional</span>}
                  </div>
                  <h3>{m.title}</h3>
                  <p>{m.summary}</p>
                  <div className="foot">
                    <span>{m.hours} h</span>
                    <div className="progress-bar" aria-hidden="true"><div className="progress-bar-fill" style={{ width: p.pct + '%' }} /></div>
                    <span>{p.pct}%</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>
      </section>
      <section className="section" aria-labelledby="exam-h">
        <div className="section-head" style={{ gridTemplateColumns: '1fr' }}><h2 id="exam-h">Final exam and certificate</h2></div>
        <ExamTeaser />
      </section>
      <p className="small muted" style={{ marginTop: 'var(--space-8)' }}>
        Every example and model answer was checked against {course.engine} on {course.built.slice(0, 10)}. Progress is saved to your account, so you can continue on any device.
      </p>
    </>
  );
}

function ExamTeaser() {
  const { course, P } = useApp();
  const { ready, missing } = examReadiness(course, P);
  return (
    <div className="card exam-card">
      <div className="exam-state" data-tone={ready ? 'ok' : 'muted'}>
        {ready ? <GraduationCap size={22} aria-hidden="true" /> : <Lock size={20} aria-hidden="true" />}
        <div>
          <strong>{ready ? 'You can take the final exam' : `Opens after every checkpoint is passed (${missing.length} to go)`}</strong>
          <p className="muted">New questions from every module, some answered by querying the practice database. Pass it to get a certificate anyone can check.</p>
        </div>
      </div>
      <a className={ready ? 'btn-primary' : 'btn-secondary'} href="#exam">{ready ? 'Go to the exam' : 'See how the exam works'}</a>
    </div>
  );
}
