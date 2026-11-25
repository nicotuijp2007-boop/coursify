// Hash routes, unchanged from the original course: #home, #<moduleId>, #<lessonId> (e.g. #m02-l1),
// #<moduleId>-cp. Anything unknown falls back to home, as before.
import type { Course, Module } from './types';

export type Route =
  | { kind: 'home'; hash: string }
  | { kind: 'module'; hash: string; mod: Module }
  | { kind: 'lesson'; hash: string; mod: Module; idx: number }
  | { kind: 'checkpoint'; hash: string; mod: Module };

export function parseRoute(course: Course, rawHash: string): Route {
  const hash = rawHash.replace(/^#/, '') || 'home';
  const byId = (id: string) => course.modules.find(m => m.id === id);
  if (hash === 'home') return { kind: 'home', hash };
  const asMod = byId(hash);
  if (asMod) return { kind: 'module', hash, mod: asMod };
  const m = hash.match(/^(m\w+?)-(l(\d+)|cp)$/);
  const mod = m && byId(m[1]);
  if (!m || !mod) return { kind: 'home', hash: 'home' };
  if (m[2] === 'cp') return mod.checkpoint ? { kind: 'checkpoint', hash, mod } : { kind: 'module', hash: mod.id, mod };
  const idx = mod.lessons.findIndex(l => l.id === hash);
  return idx < 0 ? { kind: 'module', hash: mod.id, mod } : { kind: 'lesson', hash, mod, idx };
}

/** The lesson whose database state a page uses: the lesson itself, or the last lesson for a checkpoint. */
export function stateLesson(route: Route): { mod: Module; idx: number } | null {
  if (route.kind === 'lesson') return { mod: route.mod, idx: route.idx };
  if (route.kind === 'checkpoint') return { mod: route.mod, idx: route.mod.lessons.length - 1 };
  return null;
}
