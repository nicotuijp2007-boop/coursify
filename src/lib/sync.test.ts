import { describe, expect, it, vi } from 'vitest';
import { cacheKey, openProgress, ProgressLoadError, ProgressSaver, type ProgressBackend, type RemoteRow } from './sync';
import { emptyProgress, type Progress, type StorageLike } from './progress';

const mem = (data: Record<string, string> = {}) => ({
  data,
  getItem: (k: string) => (k in data ? data[k] : null),
  setItem: (k: string, v: string) => { data[k] = v; },
  removeItem: (k: string) => { delete data[k]; },
});
const U = 'user-1', C = 'sql', LEGACY = 'harbourline-sql-course-v1';
const withEx = (id: string): Progress => ({ ...emptyProgress(), ex: { [id]: true } });

function fakeBackend(row: RemoteRow | null = null, fail = false) {
  const saved: Progress[] = [];
  const b: ProgressBackend & { saved: Progress[]; fail: boolean } = {
    saved, fail,
    load: vi.fn(async () => { if (b.fail) throw new Error('offline'); return row; }),
    save: vi.fn(async (_c: string, p: Progress) => { if (b.fail) throw new Error('offline'); saved.push(p); }),
  };
  return b;
}

describe('openProgress', () => {
  it('uses the account copy when there are no unsent browser changes', async () => {
    const s = mem({ [cacheKey(C, U)]: JSON.stringify(withEx('old')) });
    const o = await openProgress({ backend: fakeBackend({ progress: withEx('acct'), updated_at: 'x' }), storage: s, courseId: C, userId: U });
    expect(o.source).toBe('account');
    expect(o.progress.ex).toEqual({ acct: true });
    expect(o.needsPush).toBe(false);
  });

  it('prefers unsent browser changes over the account copy', async () => {
    const s = mem({ [cacheKey(C, U)]: JSON.stringify(withEx('local')), [cacheKey(C, U) + ':unsynced']: '1' });
    const o = await openProgress({ backend: fakeBackend({ progress: withEx('acct'), updated_at: 'x' }), storage: s, courseId: C, userId: U });
    expect(o.source).toBe('browser');
    expect(o.progress.ex).toEqual({ local: true });
    expect(o.needsPush).toBe(true);
  });

  it('imports progress saved before accounts, once, when the account has none', async () => {
    const s = mem({ [LEGACY]: JSON.stringify(withEx('legacy')) });
    const o = await openProgress({ backend: fakeBackend(null), storage: s, courseId: C, userId: U, legacyKey: LEGACY });
    expect(o.source).toBe('imported');
    expect(o.progress.ex).toEqual({ legacy: true });
    expect(o.needsPush).toBe(true);
    const again = await openProgress({ backend: fakeBackend({ progress: withEx('acct'), updated_at: 'x' }), storage: s, courseId: C, userId: U, legacyKey: LEGACY });
    expect(again.source).toBe('account');
  });

  it('does not read another learner\'s browser copy', async () => {
    const s = mem({ [cacheKey(C, 'someone-else')]: JSON.stringify(withEx('theirs')) });
    const o = await openProgress({ backend: fakeBackend(null), storage: s, courseId: C, userId: U });
    expect(o.source).toBe('new');
    expect(o.progress.ex).toEqual({});
  });

  it('falls back to the browser copy when the account cannot be reached', async () => {
    const s = mem({ [cacheKey(C, U)]: JSON.stringify(withEx('local')) });
    const o = await openProgress({ backend: fakeBackend(null, true), storage: s, courseId: C, userId: U });
    expect(o.source).toBe('browser');
    expect(o.needsPush).toBe(true);
  });

  it('refuses to start empty when the account cannot be reached and nothing is cached', async () => {
    await expect(openProgress({ backend: fakeBackend(null, true), storage: mem(), courseId: C, userId: U })).rejects.toBeInstanceOf(ProgressLoadError);
  });

  it('repairs invalid fields in the account copy', async () => {
    const o = await openProgress({ backend: fakeBackend({ progress: { ex: 'nope', lessons: { a: true } }, updated_at: 'x' }), storage: mem(), courseId: C, userId: U });
    expect(o.issue).toEqual({ kind: 'repaired', fields: ['ex'], backupKey: null });
    expect(o.progress.lessons).toEqual({ a: true });
  });
});

describe('ProgressSaver', () => {
  const flush = () => new Promise(r => setTimeout(r, 0));

  it('keeps a browser copy at once and sends the latest version after the delay', async () => {
    vi.useFakeTimers();
    const b = fakeBackend(), s = mem();
    const states: string[] = [];
    const sv = new ProgressSaver({ backend: b, storage: s as StorageLike, courseId: C, userId: U, delayMs: 100, onChange: x => states.push(x.state) });
    sv.update(withEx('a'));
    sv.update(withEx('b'));
    expect(JSON.parse(s.data[cacheKey(C, U)]).ex).toEqual({ b: true });
    expect(s.data[cacheKey(C, U) + ':unsynced']).toBe('1');
    await vi.advanceTimersByTimeAsync(150);
    expect(b.saved.map(p => p.ex)).toEqual([{ b: true }]);
    expect(s.data[cacheKey(C, U) + ':unsynced']).toBeUndefined();
    expect(states.at(-1)).toBe('saved');
    vi.useRealTimers();
  });

  it('retries a failed send and reports it', async () => {
    vi.useFakeTimers();
    const b = fakeBackend(null, true), s = mem();
    const states: string[] = [];
    const sv = new ProgressSaver({ backend: b, storage: s as StorageLike, courseId: C, userId: U, delayMs: 10, retryMs: [50], onChange: x => states.push(x.state) });
    sv.update(withEx('a'));
    await vi.advanceTimersByTimeAsync(20);
    expect(states.at(-1)).toBe('failed');
    expect(s.data[cacheKey(C, U) + ':unsynced']).toBe('1');
    b.fail = false;
    await vi.advanceTimersByTimeAsync(60);
    expect(b.saved.length).toBe(1);
    expect(states.at(-1)).toBe('saved');
    vi.useRealTimers();
  });

  it('flush sends immediately', async () => {
    const b = fakeBackend();
    const sv = new ProgressSaver({ backend: b, storage: mem() as StorageLike, courseId: C, userId: U, delayMs: 60000 });
    sv.update(withEx('a'));
    sv.flush();
    await flush();
    expect(b.saved.length).toBe(1);
  });
});
