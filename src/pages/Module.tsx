import { ArrowRight, Check, Flag, Play, Target } from 'lucide-react';
import { Banners } from '@/components/Banners';
import { Html } from '@/components/Html';
import { Reveal } from '@/components/ui';
import { QUIZ_PASS_PERCENT, lessonProgress, moduleProgress } from '@/lib/course-progress';
import type { Module } from '@/lib/types';
import { useApp } from '@/state/app';

export function ModulePage({ mod }: { mod: Module }) {
  const { course, P } = useApp();
  const pr = moduleProgress(course, P, mod);
  const nm = course.modules[course.modules.indexOf(mod) + 1];
  const firstOpen = mod.lessons.find(l => !P.lessons[l.id]) ?? mod.lessons[0];
  const best = P.quizBest[mod.id];
  return (
    <>
      <header className="hero">
        <a className="crumb" href="#home">Course overview</a>
        <h1 tabIndex={-1}><span className="hero-num">{mod.num}</span>{mod.title}</h1>
        <p className="lead">{mod.summary}</p>
        <div className="hero-meta">
          <span className="mp-chip">≈ {mod.hours} hours</span>
          <span className="mp-chip" data-tone="muted">{mod.lessons.length} lesson{mod.lessons.length === 1 ? '' : 's'}</span>
          {mod.checkpoint && <span className="mp-chip" data-tone="muted">Checkpoint with quiz and practical</span>}
          {mod.kind !== 'core' && <span className="mp-chip" data-tone="muted">Optional</span>}
          {pr.done > 0 && <span className="mp-chip" data-tone="ok">{pr.pct}% done</span>}
        </div>
        <a className="btn-primary" href={'#' + (firstOpen?.id ?? mod.id + '-cp')}><Play size={16} aria-hidden="true" />{mod.lessons.some(l => P.lessons[l.id]) ? 'Continue' : 'Start the first lesson'}</a>
      </header>
      <Banners />

      <div className="grid-2" style={{ marginTop: 'var(--space-6)' }}>
        <Reveal className="card">
          <div className="card-title"><span className="icon-badge"><Target size={18} aria-hidden="true" /></span><h2>After this module you can</h2></div>
          <ul className="ticks">{mod.objectives.map((o, i) => <li key={i}><span>{o}</span></li>)}</ul>
        </Reveal>
        <Reveal className="card" delay={80}>
          <div className="card-title"><span className="icon-badge"><Flag size={18} aria-hidden="true" /></span><h2>Before you start</h2></div>
          <p className="muted">{mod.prereq && mod.prereq !== 'None' ? <>Prerequisite: <strong>{String(mod.prereq)}</strong>.</> : 'No earlier module needed.'}</p>
          <p className="muted small" style={{ marginTop: 'var(--space-3)' }}>Plan about {mod.hours} hours, including time to debug and to revise.</p>
        </Reveal>
      </div>

      {mod.intro && <section className="section"><Html html={mod.intro} /></section>}

      <section className="section" aria-labelledby="ls-h">
        <div className="section-head"><span className="mp-chapter-number" aria-hidden="true">{String(mod.lessons.length).padStart(2, '0')}</span><h2 id="ls-h">Lessons</h2><p className="muted">Work through them in order: each lesson's database builds on the examples before it.</p></div>
        <div className="lesson-list">
          {mod.lessons.map((L, i) => {
            const s = lessonProgress(course, P, L), d = !!P.lessons[L.id];
            return (
              <Reveal key={L.id} delay={i * 50}>
                <a className="card lesson-row" href={'#' + L.id}>
                  <span className="lesson-num" data-done={d}>{d ? <Check size={18} aria-label="done" /> : L.num.split('.').pop()}</span>
                  <span><span className="t">{L.num} {L.title}</span><br /><span className="d">{L.goal}</span></span>
                  <span className="r">{L.minutes} min<br />{s.done} of {s.total} done</span>
                </a>
              </Reveal>
            );
          })}
          {mod.checkpoint && (
            <Reveal>
              <a className="card lesson-row" href={`#${mod.id}-cp`} style={{ background: 'var(--brand-primary-50)' }}>
                <span className="lesson-num" data-done={!!best?.passed}><Check size={18} aria-hidden="true" /></span>
                <span><span className="t">Checkpoint</span><br /><span className="d">Quiz (pass at {QUIZ_PASS_PERCENT}%) and a timed practical task{mod.checkpoint.practical ? ` of about ${mod.checkpoint.practical.minutes} minutes` : ''}.</span></span>
                <span className="r">{best ? `Quiz ${best.score}%` : ''}</span>
              </a>
            </Reveal>
          )}
        </div>
      </section>

      {nm && (
        <a className="band" href={'#' + nm.id} style={{ textDecoration: 'none' }}>
          <div><p className="mp-eyebrow" style={{ color: 'var(--color-inverse-eyebrow)' }}>What's next</p><h2>Module {nm.num}: {nm.title}</h2><p>{nm.summary}</p></div>
          <span className="btn-primary" style={{ justifySelf: 'start' }}>Go to module {nm.num}<ArrowRight size={16} aria-hidden="true" /></span>
        </a>
      )}
    </>
  );
}
