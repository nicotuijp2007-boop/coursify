// Runs the real bundled PGlite engine in Node against the real course data.
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, NOT_RUNNING, versionLabel } from './engine';
import { loadCourse, nodeHost } from '@/test/node-host';
import type { Module } from './types';

const { course, dataset } = loadCourse();
const mod = (id: string) => course.modules.find(m => m.id === id) as Module;
const ex = (m: Module, id: string) => m.lessons.flatMap(l => l.exercises).find(e => e.id === id)!;
const idxOf = (m: Module, exId: string) => m.lessons.findIndex(l => l.exercises.some(e => e.id === exId));
let engine: Engine;
const statuses: string[] = [];

beforeAll(async () => {
  engine = new Engine(nodeHost, course.setups, dataset, s => statuses.push(s.state));
  await engine.start();
}, 120_000);

describe('engine', () => {
  it('reads its version from the running engine', () => {
    expect(engine.fullVersion).toMatch(/PostgreSQL \d+\.\d+ \(PGlite/);
    expect(engine.version).toBe(versionLabel(engine.fullVersion));
    expect(versionLabel('garbage')).toBe('PostgreSQL');
    expect(statuses).toContain('ready');
  });

  it('refuses to run before start, with the actionable message', async () => {
    const cold = new Engine(nodeHost, course.setups, dataset);
    await expect(cold.runExercise(mod('m02'), 0, 'SELECT 1')).rejects.toThrow(NOT_RUNNING);
  });

  it('grades a known-correct and a known-wrong answer', async () => {
    const m = mod('m02'), e = ex(m, 'm02-l3-e1'), i = idxOf(m, e.id);
    expect((await engine.checkExercise(m, i, e.solution!, e.solution!, e.check)).problem).toBe('');
    const reordered = e.solution!.replace(/ORDER BY annual_premium DESC/, 'ORDER BY annual_premium ASC');
    expect((await engine.checkExercise(m, i, reordered, e.solution!, e.check)).problem).toMatch(/^Row 1 differs/);
    await expect(engine.checkExercise(m, i, 'SELEC 1', e.solution!, e.check)).rejects.toThrow(/syntax error/);
  });

  it('learner changes are rolled back, including sequences', async () => {
    const m = mod('m07'), e = ex(m, 'm07-l4-e3'), i = idxOf(m, e.id);
    const count = async () => (await engine.runExercise(m, i, 'SELECT count(*) AS n FROM import_batches')).t.rows[0][0];
    const nextId = async () => (await engine.runExercise(m, i, e.solution! + '\n;SELECT max(batch_id) AS id FROM import_batches')).t.rows[0][0];
    const before = await count();
    const id1 = await nextId(), id2 = await nextId();
    expect(id2).toBe(id1); // the identity sequence was restored between runs
    expect(await count()).toBe(before);
  });

  it('verify exercises compare the check query after the change', async () => {
    const m = mod('m07'), e = ex(m, 'm07-l3-e2'), i = idxOf(m, e.id);
    expect((await engine.checkExercise(m, i, e.solution!, e.solution!, e.check, e.verify)).problem).toBe('');
    expect((await engine.checkExercise(m, i, 'SELECT 1', e.solution!, e.check, e.verify)).problem).not.toBe('');
  });

  it('a learner COMMIT does not leak into the model answer or later runs', async () => {
    const m = mod('m02'), e = ex(m, 'm02-l1-e1');
    const cheat = `UPDATE policies SET annual_premium = 0; COMMIT;\n${e.solution}`;
    // The original course graded this as Correct (reproduced in legacy.html on 2026-11-25).
    expect((await engine.checkExercise(m, 0, cheat, e.solution!, e.check)).problem).not.toBe('');
    const zero = await engine.runExercise(m, 0, 'SELECT count(*) AS n FROM policies WHERE annual_premium = 0');
    expect(zero.t.rows[0][0]).toBe(0);
    // A COMMIT followed by an SQL error must also trigger a rebuild.
    await expect(engine.runExercise(m, 0, 'UPDATE policies SET annual_premium = 0; COMMIT; SELEC 1')).rejects.toThrow(/syntax/);
    expect((await engine.runExercise(m, 0, 'SELECT count(*) AS n FROM policies WHERE annual_premium = 0')).t.rows[0][0]).toBe(0);
    // An ordinary SELECT does not cause a rebuild (no extra "loading" status).
    const n = statuses.length;
    await engine.runExercise(m, 0, 'SELECT 1');
    expect(statuses.slice(n)).not.toContain('loading');
  });

  it('overlapping operations are serialised and give the same results as sequential ones', async () => {
    const m = mod('m02'), e = ex(m, 'm02-l3-e1'), i = idxOf(m, e.id);
    const results = await Promise.all([
      engine.runExercise(m, i, 'UPDATE policies SET annual_premium = 1; SELECT sum(annual_premium) AS s FROM policies'),
      engine.checkExercise(m, i, e.solution!, e.solution!, e.check),
      engine.runExercise(m, i, 'SELECT count(*) AS n FROM policies WHERE annual_premium = 1'),
    ]);
    expect(results[1].problem).toBe('');
    expect((results[2] as { t: { rows: unknown[][] } }).t.rows[0][0]).toBe(0);
  });

  it('persistent examples change state once; reset rebuilds the lesson', async () => {
    const m = mod('m07');
    const L = m.lessons[0], i = L.examples.findIndex(x => x.sql && /CREATE TABLE/i.test(x.sql) && !x.temp && !x.expectError && !x.manual);
    expect(i).toBeGreaterThanOrEqual(0);
    await engine.reset(m, 0);
    await engine.runExample(m, 0, i, L.examples[i].sql!);
    await expect(engine.runExample(m, 0, i, L.examples[i].sql!)).rejects.toThrow(/already exists/);
    await engine.reset(m, 0);
    await expect(engine.runExample(m, 0, i, L.examples[i].sql!)).resolves.toBeDefined();
  });

  it('JavaScript exercises run through the Supabase-style adapter', async () => {
    const m = mod('m10b'), e = ex(m, 'm10b-l2-e1'), i = idxOf(m, e.id);
    expect((await engine.checkJs(m, i, e.jsSolution!, e.jsSolution!)).pass).toBe(true);
    const wrong = await engine.checkJs(m, i, 'console.log("nope")', e.jsSolution!);
    expect(wrong.pass).toBe(false);
    expect(wrong.why).toMatch(/Line 1 differs|printed/);
  });

  it('a missing setup script fails with a clear message', async () => {
    const broken = { ...mod('m02'), id: 'mx', setup: 'dataset+does_not_exist' };
    await expect(engine.prepare(broken, 0)).rejects.toThrow(/Setup script "does_not_exist"/);
  });
});
