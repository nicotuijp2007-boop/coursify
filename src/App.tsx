import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Award, Check, ChevronRight, Copy, GraduationCap, House, Lock, Menu, RotateCcw } from 'lucide-react';
import { parseRoute, stateLesson, type Route } from '@/lib/route';
import { courseProgress, moduleProgress, moduleStatus } from '@/lib/course-progress';
import { useApp } from '@/state/app';
import { HomePage } from '@/pages/Home';
import { ModulePage } from '@/pages/Module';
import { LessonPage, lessonSections } from '@/pages/Lesson';
import { CheckpointPage } from '@/pages/Checkpoint';
import { AccountMenu } from '@/components/Account';
import { ExamPage } from '@/pages/Exam';
import { CertificatePage } from '@/pages/Certificate';
import { examReadiness } from '@/lib/exam';

const subscribeHash = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const useHash = () => useSyncExternalStore(subscribeHash, () => location.hash);

/** Which of the given section ids is currently at the top of the viewport. */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (!ids.length) { setActive(null); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.3;
      let cur: string | null = null;
      for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= line) cur = id; }
      setActive(cur ?? ids[0]);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

function ReadProgress() {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  return <div className="read-progress" aria-hidden="true"><span ref={bar} /></div>;
}

function Sidebar({ route, open, onNavigate }: { route: Route; open: boolean; onNavigate: () => void }) {
  const { meta, course, P } = useApp();
  const curMod = 'mod' in route ? route.mod : null;
  const [openMods, setOpenMods] = useState<Set<string>>(() => new Set(curMod ? [curMod.id] : []));
  useEffect(() => { if (curMod) setOpenMods(s => (s.has(curMod.id) ? s : new Set(s).add(curMod.id))); }, [curMod]);
  const sections = route.kind === 'lesson' ? lessonSections(route.mod.lessons[route.idx]) : [];
  const active = useScrollSpy(sections.map(s => s.id));
  const cp = courseProgress(course, P);
  const lessons = course.modules.flatMap(m => m.lessons);
  const doneL = lessons.filter(l => P.lessons[l.id]).length;
  const groups: [string, typeof course.modules][] = [['Core path', course.modules.filter(m => m.kind === 'core')], ['Optional', course.modules.filter(m => m.kind !== 'core')]];
  const cur = (hash: string) => (route.hash === hash ? 'page' : undefined);

  return (
    <nav className="sidebar" id="side" aria-label="Course navigation" data-open={open}>
      <div className="sidebar-head">
        <a className="brand" href="#home" onClick={onNavigate}>
          <div className="mp-eyebrow">{meta.brand}</div>
          <div className="brand-title">{curMod ? `Module ${curMod.num} · ${curMod.title}` : 'Course overview'}</div>
        </a>
        <div className="side-progress">
          <div className="progress-bar" aria-hidden="true"><div className="progress-bar-fill" style={{ width: cp.pct + '%' }} /></div>
          <p aria-live="polite">{cp.pct}% done · {doneL} of {lessons.length} lessons</p>
        </div>
      </div>
      <div className="sidebar-scroll">
        <ol className="toc"><li><a className="toc-link" href="#home" aria-current={cur('home')} onClick={onNavigate}><span className="toc-num"><House size={13} aria-hidden="true" /></span>Course overview</a></li></ol>
        {groups.filter(g => g[1].length).map(([label, mods]) => (
          <div key={label}>
            <div className="toc-group">{label}</div>
            <ol className="toc">
              {mods.map(m => {
                const isOpen = openMods.has(m.id), st = moduleStatus(course, P, m);
                return (
                  <li key={m.id}>
                    <button type="button" className="toc-mod" aria-expanded={isOpen} aria-controls={`sub-${m.id}`}
                      onClick={() => setOpenMods(s => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}>
                      <span className="toc-num" data-state={st === 'completed' ? 'done' : curMod?.id === m.id ? 'active' : undefined}>{st === 'completed' ? <Check size={13} aria-label="completed" /> : m.num}</span>
                      <span>{m.title}</span>
                      <span className="pct">{moduleProgress(course, P, m).pct}%</span>
                      <ChevronRight size={16} className="chev" aria-hidden="true" />
                    </button>
                    <div className="toc-sub" id={`sub-${m.id}`} data-open={isOpen}>
                      <ol>
                        <li><a className="toc-link" href={'#' + m.id} aria-current={cur(m.id)} onClick={onNavigate}><span className="toc-tick" aria-hidden="true" />Module overview</a></li>
                        {m.lessons.map(L => (
                          <li key={L.id}>
                            <a className="toc-link" href={'#' + L.id} aria-current={cur(L.id)} onClick={onNavigate}>
                              <span className="toc-tick" data-done={!!P.lessons[L.id]} aria-hidden="true">{P.lessons[L.id] && <Check size={12} />}</span>
                              <span>{L.num} {L.title}{P.lessons[L.id] && <span className="sr-only"> (done)</span>}</span>
                            </a>
                            {route.kind === 'lesson' && route.hash === L.id && sections.length > 0 && (
                              <div className="toc-sections">
                                {sections.map(s => <a key={s.id} href={'#' + L.id} aria-current={active === s.id ? 'true' : undefined}
                                  onClick={ev => { ev.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); document.getElementById(s.id)?.querySelector('h2')?.focus({ preventScroll: true }); onNavigate(); }}>{s.label}</a>)}
                              </div>
                            )}
                          </li>
                        ))}
                        {m.checkpoint && (() => { const d = !!(m.checkpoint.practical && P.practical[m.checkpoint.practical.id]); return (
                          <li><a className="toc-link" href={`#${m.id}-cp`} aria-current={cur(m.id + '-cp')} onClick={onNavigate}>
                            <span className="toc-tick" data-done={d} aria-hidden="true">{d && <Check size={12} />}</span>Checkpoint{d && <span className="sr-only"> (passed)</span>}</a></li>); })()}
                      </ol>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <div className="toc-group">Finish</div>
        <ol className="toc">
          <li><a className="toc-link" href="#exam" aria-current={cur('exam')} onClick={onNavigate}>
            <span className="toc-num">{examReadiness(course, P).ready ? <GraduationCap size={13} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}</span>Final exam</a></li>
          <li><a className="toc-link" href="#certificate" aria-current={cur('certificate')} onClick={onNavigate}>
            <span className="toc-num"><Award size={13} aria-hidden="true" /></span>Certificate</a></li>
        </ol>
      </div>
    </nav>
  );
}

function Topbar({ route, onMenu, menuOpen }: { route: Route; onMenu: () => void; menuOpen: boolean }) {
  const { status, engine, dataset, toast, confirm } = useApp();
  const target = stateLesson(route);
  const reset = async () => {
    if (!target) { toast('Open a lesson first: the database is rebuilt for the lesson you are in.'); return; }
    if (!(await confirm('Reset the database?', 'This rebuilds the practice database for this lesson. Your saved answers and progress stay; changes you made with SQL are undone.', 'Reset database'))) return;
    try { await engine.reset(target.mod, target.idx); toast('Database reset for this lesson.', 'ok'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };
  const copyDataset = async () => {
    try { await navigator.clipboard.writeText(dataset); toast('Dataset script copied. Paste it in the SQL editor of sql-course and run it.', 'ok'); }
    catch { toast('Your browser blocked copying.', 'err'); }
  };
  return (
    <header className="topbar">
      <button type="button" className="btn-ghost menu-btn" onClick={onMenu} aria-controls="side" aria-expanded={menuOpen}><Menu size={18} aria-hidden="true" />Menu</button>
      <span className="grow" />
      <span className="engine" id="engine" role="status" data-state={status.state} title={engine.fullVersion || undefined}><span className="dot" aria-hidden="true" /><span className="lbl-engine">{status.label}</span></span>
      <button type="button" className="btn-secondary btn-sm" onClick={reset} disabled={status.state === 'unavailable' || status.state === 'starting'} title="Reset database"><RotateCcw size={15} aria-hidden="true" /><span className="lbl">Reset database</span></button>
      <button type="button" className="btn-secondary btn-sm" onClick={copyDataset} title="Copy dataset script"><Copy size={15} aria-hidden="true" /><span className="lbl">Copy dataset script</span></button>
      <AccountMenu showCourses />
      <ReadProgress />
    </header>
  );
}

export function App() {
  const { meta, course, setLast, status } = useApp();
  const hash = useHash();
  const route = parseRoute(course, hash);
  const [menu, setMenu] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    setMenu(false);
    if (route.kind === 'lesson' || route.kind === 'checkpoint') setLast(route.hash);
    // Move focus to the new page heading so keyboard and screen-reader users start at the top.
    if (!first.current) mainRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    first.current = false;
    document.title = route.kind === 'home' ? `${meta.title} · Coursify`
      : route.kind === 'exam' ? `Final exam · ${meta.shortTitle}`
      : route.kind === 'certificate' ? `Certificate · ${meta.shortTitle}`
      : route.kind === 'lesson' ? `${route.mod.lessons[route.idx].num} ${route.mod.lessons[route.idx].title} · ${meta.shortTitle}`
      : route.kind === 'checkpoint' ? `Checkpoint ${route.mod.num} · ${meta.shortTitle}` : `Module ${route.mod.num} · ${meta.shortTitle}`;
  }, [route.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); document.querySelector<HTMLElement>('.menu-btn')?.focus(); } };
    document.addEventListener('keydown', onKey);
    document.querySelector<HTMLElement>('#side a, #side button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  // Build the lesson database as soon as the engine is ready, so the first Run is fast.
  const engine = useApp().engine;
  const target = stateLesson(route);
  useEffect(() => {
    if (status.state === 'ready' && target) engine.prepare(target.mod, target.idx).catch(() => {});
  }, [route.hash, status.state === 'ready']); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell">
      <a className="skip-link btn-primary" href="#content" onClick={e => { e.preventDefault(); mainRef.current?.querySelector<HTMLElement>('h1')?.focus(); }}>Skip to content</a>
      <Sidebar route={route} open={menu} onNavigate={() => setMenu(false)} />
      <div className="scrim" data-open={menu} onClick={() => setMenu(false)} />
      <div className="main">
        <Topbar route={route} onMenu={() => setMenu(true)} menuOpen={menu} />
        <main className="page" id="content" ref={mainRef} {...(menu ? { inert: true } : {})}>
          <div key={route.hash} className="page-enter">
            {route.kind === 'home' && <HomePage />}
            {route.kind === 'module' && <ModulePage mod={route.mod} />}
            {route.kind === 'lesson' && <LessonPage mod={route.mod} idx={route.idx} />}
            {route.kind === 'checkpoint' && <CheckpointPage mod={route.mod} />}
            {route.kind === 'exam' && <ExamPage />}
            {route.kind === 'certificate' && <CertificatePage />}
          </div>
        </main>
      </div>
    </div>
  );
}
