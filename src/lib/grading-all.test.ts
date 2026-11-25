// Every model answer in the course must pass the checker of the ported engine (same set as tests/grade-all.mjs).
import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { loadCourse, nodeHost } from '@/test/node-host';

const { course, dataset } = loadCourse();

describe.runIf(process.env.GRADE_ALL)('all model answers pass', () => {
  it('every exercise, practical and checkpoint write question', async () => {
    const engine = new Engine(nodeHost, course.setups, dataset);
    await engine.start();
    const failures: string[] = [];
    let n = 0;
    const grade = async (id: string, fn: () => Promise<string>) => {
      n++;
      try { const p = await fn(); if (p) failures.push(`${id}: ${p}`); } catch (e) { failures.push(`${id}: ${(e as Error).message}`); }
    };
    for (const m of course.modules) {
      for (const [i, L] of m.lessons.entries()) {
        for (const e of L.exercises) {
          if (e.check === 'manual') continue;
          if (e.check === 'js') await grade(e.id, async () => { const r = await engine.checkJs(m, i, e.jsSolution!, e.jsSolution!); return r.pass ? '' : r.why || 'blocked'; });
          else await grade(e.id, async () => (await engine.checkExercise(m, i, e.solution!, e.solution!, e.check, e.verify)).problem);
        }
      }
      const last = m.lessons.length - 1, cp = m.checkpoint;
      const pr = cp?.practical;
      if (pr) {
        if (pr.check === 'js') await grade(pr.id, async () => { const r = await engine.checkJs(m, last, pr.jsSolution!, pr.jsSolution!); return r.pass ? '' : r.why; });
        else await grade(pr.id, async () => (await engine.checkExercise(m, last, pr.solution!, pr.solution!, pr.check, pr.verify)).problem);
      }
      for (const q of cp?.quiz.filter(q => q.type === 'write') ?? []) await grade(q.id, async () => (await engine.checkExercise(m, last, q.solution!, q.solution!, q.check)).problem);
    }
    expect(failures).toEqual([]);
    expect(n).toBe(267);
  }, 600_000);
});
