// Progress per account and course. The account copy (Supabase, table coursify_progress) is the
// source of truth; a copy in localStorage keeps the latest answers if the page closes or the network
// drops before they reach the account, and is pushed on the next visit.
import { emptyProgress, loadProgress, normalizeProgress, saveProgress, type LoadIssue, type Progress, type StorageLike } from './progress';

export interface RemoteRow { progress: unknown; updated_at: string }

/** Where account progress is stored. Implemented with Supabase in supabase.ts; faked in tests. */
export interface ProgressBackend {
  load(courseId: string): Promise<RemoteRow | null>;
  save(courseId: string, progress: Progress): Promise<void>;
}

export const cacheKey = (courseId: string, userId: string) => `coursify:${courseId}:${userId}`;
const unsyncedKey = (courseId: string, userId: string) => cacheKey(courseId, userId) + ':unsynced';

export type Source = 'account' | 'browser' | 'imported' | 'new';

export interface Opened {
  progress: Progress;
  issue: LoadIssue | null;
  /** Where the progress came from: the account, unsent browser changes, pre-account progress, or nothing. */
  source: Source;
  /** The browser copy is newer than the account and must be sent. */
  needsPush: boolean;
}

export class ProgressLoadError extends Error {}

function isUnsynced(storage: StorageLike | null, key: string): boolean {
  try { return storage?.getItem(key) === '1'; } catch { return false; }
}

/**
 * Picks the starting progress for a course:
 * unsent browser changes > account copy > browser copy > pre-account progress (imported once) > empty.
 * If the account cannot be reached and the browser holds no copy, throws ProgressLoadError instead
 * of starting empty, so a later save can never overwrite the account with blank progress.
 */
export async function openProgress(o: {
  backend: ProgressBackend; storage: StorageLike | null; courseId: string; userId: string;
  legacyKey?: string; now?: () => number;
}): Promise<Opened> {
  const now = o.now ?? Date.now;
  const key = cacheKey(o.courseId, o.userId);
  const cached = loadProgress(o.storage, now, key);
  const unsynced = cached.found && isUnsynced(o.storage, unsyncedKey(o.courseId, o.userId));

  let remote: RemoteRow | null;
  try {
    remote = await o.backend.load(o.courseId);
  } catch (e) {
    if (cached.found) return { progress: cached.progress, issue: cached.issue, source: 'browser', needsPush: true };
    throw new ProgressLoadError(`Your saved progress could not be loaded (${e instanceof Error ? e.message : String(e)}).`);
  }

  if (unsynced) return { progress: cached.progress, issue: cached.issue, source: 'browser', needsPush: true };
  if (remote) {
    const n = normalizeProgress(remote.progress);
    const issue: LoadIssue | null = 'malformed' in n ? { kind: 'malformed', backupKey: null }
      : n.bad.length ? { kind: 'repaired', fields: n.bad, backupKey: null } : null;
    return { progress: n.progress, issue, source: 'account', needsPush: false };
  }
  if (cached.found) return { progress: cached.progress, issue: cached.issue, source: 'browser', needsPush: true };
  if (o.legacyKey) {
    const legacy = loadProgress(o.storage, now, o.legacyKey);
    if (legacy.found) return { progress: legacy.progress, issue: legacy.issue, source: 'imported', needsPush: true };
    if (legacy.issue?.kind === 'unavailable') return { progress: emptyProgress(), issue: legacy.issue, source: 'new', needsPush: false };
  }
  return { progress: emptyProgress(), issue: cached.issue, source: 'new', needsPush: false };
}

export type CloudState = 'saved' | 'saving' | 'failed';

/**
 * Saves every change to the browser copy at once and to the account shortly after (debounced).
 * A failed send is retried with growing delays and when the browser comes back online.
 */
export class ProgressSaver {
  private latest: Progress | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private dirty = false;
  private failures = 0;
  private stopped = false;
  state: CloudState = 'saved';
  /** False when the browser refused to keep the local copy (private mode, full storage). */
  localOk = true;

  constructor(
    private o: { backend: ProgressBackend; storage: StorageLike | null; courseId: string; userId: string;
      onChange?: (s: { state: CloudState; localOk: boolean }) => void; delayMs?: number; retryMs?: number[] },
  ) {}

  private emit(state: CloudState) {
    this.state = state;
    this.o.onChange?.({ state, localOk: this.localOk });
  }

  private setUnsynced(v: boolean) {
    try {
      const k = unsyncedKey(this.o.courseId, this.o.userId);
      if (v) this.o.storage?.setItem(k, '1'); else (this.o.storage as Storage | null)?.removeItem?.(k);
    } catch { /* the account copy is what matters; the flag only speeds up recovery */ }
  }

  update(p: Progress) {
    if (this.stopped) return;
    this.latest = p;
    this.dirty = true;
    this.localOk = saveProgress(this.o.storage, p, cacheKey(this.o.courseId, this.o.userId));
    this.setUnsynced(true);
    if (this.state !== 'failed') this.emit('saving');
    this.schedule(this.o.delayMs ?? 1000);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.send(); }, ms);
  }

  /** Sends now (page hidden, back online). Safe to call at any time. */
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.dirty) void this.send();
  }

  private async send() {
    if (this.sending || !this.dirty || !this.latest || this.stopped) return;
    this.sending = true;
    this.dirty = false;
    const p = this.latest;
    try {
      await this.o.backend.save(this.o.courseId, p);
      this.failures = 0;
      if (!this.dirty) { this.setUnsynced(false); this.emit('saved'); }
    } catch {
      this.dirty = true;
      const retry = this.o.retryMs ?? [3000, 10000, 30000, 60000];
      this.schedule(retry[Math.min(this.failures, retry.length - 1)]);
      this.failures++;
      this.emit('failed');
    } finally {
      this.sending = false;
      if (this.dirty && !this.timer && !this.stopped) this.schedule(this.o.delayMs ?? 1000);
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
