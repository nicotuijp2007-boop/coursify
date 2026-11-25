// Progress figures shown on the dashboard, module pages and sidebar. Same counting rules as the
// original course: automatically checked exercises + completed interactive blocks + checkpoint parts.
import type { Progress } from './progress';
import type { Course, Exercise, Lesson, Module } from './types';

export const QUIZ_PASS_PERCENT = 70;

/** Kit block types that are display-only and therefore never count towards progress. */
const PASSIVE_KIT = ['callout', 'stats', 'table', 'then-now', 'flow', 'timeline', 'summary'];

export function kitIdsIn(course: Course, html: string | undefined): string[] {
  return [...String(html || '').matchAll(/data-k="([^"]+)"/g)]
    .map(m => m[1])
    .filter(id => course.kit?.[id] && !PASSIVE_KIT.includes(course.kit[id].type));
}

export const graded = (e: Exercise) => e.check !== 'manual';

export interface Count { done: number; total: number; pct: number }
const count = (done: number, total: number): Count => ({ done, total, pct: total ? Math.round((done / total) * 100) : 0 });

export function lessonProgress(course: Course, P: Progress, L: Lesson): Count {
  const ex = L.exercises.filter(graded), kit = kitIdsIn(course, L.explain + (L.project || ''));
  return count(ex.filter(e => P.ex[e.id]).length + kit.filter(id => P.kit[id]).length, ex.length + kit.length);
}

export function moduleProgress(course: Course, P: Progress, m: Module): Count {
  let done = 0, total = 0;
  for (const L of m.lessons) { const s = lessonProgress(course, P, L); done += s.done; total += s.total; }
  const kit = kitIdsIn(course, m.intro);
  done += kit.filter(id => P.kit[id]).length; total += kit.length;
  if (m.checkpoint?.practical) { total++; if (P.practical[m.checkpoint.practical.id]) done++; }
  if (m.checkpoint?.quiz.some(q => q.type === 'mc')) { total++; if (P.quizBest[m.id]?.passed) done++; }
  return count(done, total);
}

export function courseProgress(course: Course, P: Progress): Count {
  let done = 0, total = 0;
  for (const m of course.modules) { const p = moduleProgress(course, P, m); done += p.done; total += p.total; }
  return count(done, total);
}

export type ModuleStatus = 'not-started' | 'in-progress' | 'completed';

/** Completed = practical passed (as the original sidebar tick); in progress = anything touched. */
export function moduleStatus(course: Course, P: Progress, m: Module): ModuleStatus {
  const pr = m.checkpoint?.practical;
  if (pr && P.practical[pr.id]) return 'completed';
  const touched = m.lessons.some(L => P.lessons[L.id] || L.exercises.some(e => P.ex[e.id] || P.drafts[e.id + ':tried']));
  return touched || moduleProgress(course, P, m).done > 0 ? 'in-progress' : 'not-started';
}

export type ExerciseState = 'not-started' | 'tried' | 'revealed' | 'passed';

/** Passed wins over revealed, revealed over tried. Revealing never counts as passed. */
export function exerciseState(P: Progress, id: string): ExerciseState {
  if (P.ex[id] || P.practical[id]) return 'passed';
  if (P.revealed[id]) return 'revealed';
  if (P.drafts[id + ':tried']) return 'tried';
  return 'not-started';
}

/** First lesson not yet marked done, for "Continue". */
export function nextLesson(course: Course, P: Progress): { mod: Module; lesson: Lesson } {
  for (const mod of course.modules) for (const lesson of mod.lessons) if (!P.lessons[lesson.id]) return { mod, lesson };
  return { mod: course.modules[0], lesson: course.modules[0].lessons[0] };
}
