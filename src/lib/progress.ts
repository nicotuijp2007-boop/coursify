// Learner progress in localStorage. The key and field meanings are unchanged from the original course,
// so progress saved there keeps working. Fields are kept distinct on purpose:
//   lessons   – learner marked the lesson as read/done
//   drafts    – editor text per exercise id; `<id>:tried` = learner pressed Check at least once
//   ex        – exercise passed the automatic check
//   revealed  – learner opened the model answer (new; never counts as passed)
//   practical – checkpoint practical passed the check
//   quiz      – per checkpoint question: last choice and whether it was correct
//   quizBest  – best multiple-choice score per module
//   kit       – interactive teaching block completed
//   proj      – learner self-reports a project step as done in their own app
//   last      – last visited route, for "Continue where you left off" (new)

export const KEY = 'harbourline-sql-course-v1';
export const BACKUP_PREFIX = KEY + '-backup-';

export interface QuizState { choice?: number; correct: boolean; revealed?: boolean }

export interface Progress {
  ex: Record<string, boolean>;
  drafts: Record<string, string | boolean>;
  quiz: Record<string, QuizState>;
  lessons: Record<string, boolean>;
  practical: Record<string, boolean>;
  kit: Record<string, boolean>;
  proj: Record<string, boolean>;
  quizBest: Record<string, { score: number; passed: boolean }>;
  revealed: Record<string, boolean>;
  last?: string;
  [extra: string]: unknown;
}

const MAPS = ['ex', 'drafts', 'quiz', 'lessons', 'practical', 'kit', 'proj', 'quizBest', 'revealed'] as const;

export type LoadIssue =
  | { kind: 'unavailable' }                       // storage cannot be read: progress will not be saved
  | { kind: 'malformed'; backupKey: string | null }  // stored text was not usable; a copy was kept
  | { kind: 'repaired'; fields: string[]; backupKey: string | null }; // some fields were invalid and reset

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function emptyProgress(): Progress {
  return { ex: {}, drafts: {}, quiz: {}, lessons: {}, practical: {}, kit: {}, proj: {}, quizBest: {}, revealed: {} };
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keep a copy of stored text we could not fully use, so nothing is silently lost. */
function backup(storage: StorageLike, text: string, now: () => number): string | null {
  const k = BACKUP_PREFIX + now();
  try { storage.setItem(k, text); return k; } catch { return null; }
}

/** Reads progress. Never throws: unusable data is backed up and replaced with defaults. */
export function loadProgress(storage: StorageLike | null, now: () => number = Date.now): { progress: Progress; issue: LoadIssue | null } {
  const progress = emptyProgress();
  let text: string | null;
  try {
    if (!storage) throw new Error('no storage');
    text = storage.getItem(KEY);
  } catch {
    return { progress, issue: { kind: 'unavailable' } };
  }
  if (text === null || text === '') return { progress, issue: null };
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = undefined; }
  if (!isMap(data)) return { progress, issue: { kind: 'malformed', backupKey: backup(storage!, text, now) } };

  const bad: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if ((MAPS as readonly string[]).includes(k)) {
      if (isMap(v)) progress[k] = v; else bad.push(k);
    } else if (k === 'last') {
      if (typeof v === 'string') progress.last = v; else bad.push(k);
    } else progress[k] = v; // unknown fields are kept and written back
  }
  if (bad.length) return { progress, issue: { kind: 'repaired', fields: bad, backupKey: backup(storage!, text, now) } };
  return { progress, issue: null };
}

/** Returns false when the browser refused to save (private mode, quota, blocked storage). */
export function saveProgress(storage: StorageLike | null, p: Progress): boolean {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}
