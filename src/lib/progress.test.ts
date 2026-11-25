import { describe, expect, it } from 'vitest';
import { BACKUP_PREFIX, KEY, loadProgress, saveProgress, type StorageLike } from './progress';

function mem(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}
const now = () => 1700000000000;

describe('loadProgress', () => {
  it('fresh storage gives every map, including the ones the original forgot to initialise', () => {
    const { progress, issue } = loadProgress(mem(), now);
    expect(issue).toBeNull();
    for (const k of ['ex', 'drafts', 'quiz', 'lessons', 'practical', 'kit', 'proj', 'quizBest', 'revealed']) expect(progress[k]).toEqual({});
  });

  it('legacy progress from the original course loads unchanged', () => {
    const legacy = { ex: { 'm02-l1-e1': true }, drafts: { 'm02-l1-e1': 'SELECT 1', 'm02-l1-e1:tried': true }, quiz: { q1: { choice: 2, correct: true } }, lessons: { 'm02-l1': true }, practical: { 'm01-p': true }, kit: { k: true }, proj: { 'm09-l1': true }, quizBest: { m01: { score: 75, passed: true } } };
    const s = mem({ [KEY]: JSON.stringify(legacy) });
    const { progress, issue } = loadProgress(s, now);
    expect(issue).toBeNull();
    expect(progress).toMatchObject(legacy);
    expect(progress.revealed).toEqual({});
    saveProgress(s, progress);
    expect(JSON.parse(s.data[KEY])).toMatchObject(legacy); // round trip keeps everything
  });

  it('partial progress (old version with only some fields) gets defaults for the rest', () => {
    const { progress, issue } = loadProgress(mem({ [KEY]: '{"ex":{"a":true}}' }), now);
    expect(issue).toBeNull();
    expect(progress.ex).toEqual({ a: true });
    expect(progress.quizBest).toEqual({});
  });

  it('malformed JSON is backed up, not thrown away', () => {
    const s = mem({ [KEY]: '{"ex":{"a":tru' });
    const { progress, issue } = loadProgress(s, now);
    expect(issue).toEqual({ kind: 'malformed', backupKey: BACKUP_PREFIX + now() });
    expect(s.data[BACKUP_PREFIX + now()]).toBe('{"ex":{"a":tru');
    expect(progress.ex).toEqual({});
  });

  it('an invalid field is reset while valid fields survive', () => {
    const s = mem({ [KEY]: JSON.stringify({ ex: { a: true }, kit: null, quizBest: [1], custom: 5 }) });
    const { progress, issue } = loadProgress(s, now);
    expect(issue).toMatchObject({ kind: 'repaired', fields: ['kit', 'quizBest'] });
    expect(progress.ex).toEqual({ a: true });
    expect(progress.kit).toEqual({});
    expect(progress.custom).toBe(5);
    expect(s.data[BACKUP_PREFIX + now()]).toBeDefined();
  });

  it('unavailable storage still gives usable progress and a visible issue', () => {
    const throwing: StorageLike = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    expect(loadProgress(throwing, now).issue).toEqual({ kind: 'unavailable' });
    expect(loadProgress(null, now).progress.ex).toEqual({});
    expect(saveProgress(throwing, loadProgress(null).progress)).toBe(false);
  });
});
