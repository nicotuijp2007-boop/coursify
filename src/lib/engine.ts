// The in-page PostgreSQL practice engine. Behaviour is ported from the original course (legacy.html):
// - each module starts from its setup scripts (snapshotted after the first build);
// - a lesson's state is the setup plus the persistent examples of all earlier lessons;
// - learner SQL runs inside BEGIN … ROLLBACK and sequences are restored afterwards.
// Changes against the original, each covered by src/lib/engine.test.ts:
// - every public operation is serialised, so overlapping clicks cannot interleave transactions;
// - when the learner's SQL ends the practice transaction (COMMIT/END/ROLLBACK), the state is rebuilt
//   before the model answer runs, so both are compared from the same database state;
// - the version label comes from the running engine instead of a fixed string.
import { compare, lastTable, type QueryResult } from './compare';
import type { CheckMode, Example, Lesson, Module, ResultTable } from './types';

export interface PGliteLike {
  exec(sql: string): Promise<QueryResult[]>;
  query(sql: string, params?: unknown[]): Promise<QueryResult & { rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression?: 'none' | 'gzip' | 'auto'): Promise<Blob>;
}

export interface JsResult { logs: string[]; error: string | null; blocked?: boolean }

/** Platform-specific loading of the engine and the JavaScript adapter (browser or Node tests). */
export interface EngineHost {
  createDb(options: Record<string, unknown>): Promise<PGliteLike>;
  loadJsRunner(): Promise<{ runJs(db: PGliteLike, code: string): Promise<JsResult> }>;
}

export type EngineStatus = { state: 'starting' | 'loading' | 'ready' | 'error' | 'unavailable'; label: string };

export interface RunResult { t: ResultTable; v: ResultTable | null }
export interface CheckResult { problem: string; got: ResultTable }
export interface JsCheckResult { pass: boolean; why: string; mine: JsResult }

// Dates, timestamps, times and intervals stay text, exactly as PostgreSQL prints them.
const raw = (v: unknown) => v;
const PARSERS = { 1082: raw, 1114: raw, 1184: raw, 1083: raw, 1266: raw, 1186: raw };
const SEQ_SNAP = "SELECT format('%I.%I', schemaname, sequencename) AS seq, coalesce(last_value, start_value) AS v, last_value IS NOT NULL AS called FROM pg_sequences";
const TX_MARK = 'harbourline_practice';
const TX_WORDS = /\b(commit|end|abort|rollback(?!\s+to\b))\b/i;

export const NOT_RUNNING = 'The in-page database is not running in this browser. Use the Supabase SQL editor instead.';

export function persistent(ex: Example): boolean {
  return !ex.temp && !ex.expectError && !ex.manual && !!ex.sql;
}

/** "PostgreSQL 18.7 (PGlite 0.5.17) on wasm32…" → "PostgreSQL 18.7". */
export function versionLabel(version: string): string {
  const m = /PostgreSQL ([\d.]+)/.exec(version);
  return m ? `PostgreSQL ${m[1]}` : 'PostgreSQL';
}

export class Engine {
  private db: PGliteLike | null = null;
  private stateKey = '';
  private applied = new Set<string>();
  private snaps: Record<string, Blob> = {};
  private tail: Promise<unknown> = Promise.resolve();
  private jsRunner: Awaited<ReturnType<EngineHost['loadJsRunner']>> | null = null;
  ok = false;
  version = '';
  fullVersion = '';

  constructor(
    private host: EngineHost,
    private setups: Record<string, string>,
    private dataset: string,
    private onStatus: (s: EngineStatus) => void = () => {},
  ) {}

  /** Runs operations one at a time, in call order, even when one fails. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.tail.then(fn, fn);
    this.tail = r.catch(() => {});
    return r;
  }

  private started: Promise<void> | null = null;

  /** Starts the engine once; later calls return the same promise. */
  start(): Promise<void> {
    this.started ??= this.serial(async () => {
      this.onStatus({ state: 'starting', label: 'Database starting' });
      try {
        await this.newDb();
        this.fullVersion = String((await this.db!.query('SELECT version() AS v')).rows[0].v);
        this.version = versionLabel(this.fullVersion);
        this.ok = true;
        this.ready();
      } catch (e) {
        this.onStatus({ state: 'unavailable', label: 'Database unavailable' });
        throw e;
      }
    });
    return this.started;
  }

  private ready() { this.onStatus({ state: 'ready', label: `${this.version} ready` }); }

  private async newDb(snap?: Blob) {
    if (this.db) { try { await this.db.close(); } catch { /* already closed */ } }
    this.db = null;
    this.db = await this.host.createDb({ parsers: PARSERS, ...(snap ? { loadDataDir: snap } : {}) });
    await this.db.exec("SET TimeZone = 'UTC'");
  }

  private need(): PGliteLike {
    if (!this.ok || !this.db) throw new Error(NOT_RUNNING);
    return this.db;
  }

  private async buildState(mod: Module, lessonIdx: number) {
    this.need();
    const key = mod.id + ':' + lessonIdx;
    if (key === this.stateKey && this.db) return;
    this.onStatus({ state: 'loading', label: 'Loading data' });
    try {
      if (this.snaps[mod.setup]) await this.newDb(this.snaps[mod.setup]);
      else {
        await this.newDb();
        for (const step of mod.setup.split('+').map(s => s.trim()).filter(Boolean)) {
          const script = step === 'dataset' ? this.dataset : this.setups[step];
          if (script === undefined) throw new Error(`Setup script "${step}" for module ${mod.num} is missing from the course data.`);
          await this.db!.exec(script);
        }
        try { this.snaps[mod.setup] = await this.db!.dumpDataDir('none'); } catch { /* snapshot is an optimisation */ }
      }
      this.applied = new Set();
      for (let i = 0; i < lessonIdx; i++) await this.applyExamples(mod.lessons[i], true);
      this.stateKey = key;
      this.ready();
    } catch (e) {
      this.stateKey = '';
      this.onStatus({ state: 'error', label: 'Database error' });
      throw e;
    }
  }

  private async applyExamples(lesson: Lesson, silent: boolean) {
    for (const [i, ex] of lesson.examples.entries()) {
      const id = lesson.id + ':' + i;
      if (this.applied.has(id) || !persistent(ex)) continue;
      try { await this.db!.exec(ex.sql!); } catch (e) { if (!silent) console.warn(e); }
      this.applied.add(id);
    }
  }

  private async seqSnapshot() {
    try { return (await this.db!.query(SEQ_SNAP)).rows as { seq: string; v: unknown; called: boolean }[]; } catch { return []; }
  }

  private async seqRestore(snap: { seq: string; v: unknown; called: boolean }[]) {
    for (const s of snap) await this.db!.query('SELECT setval($1::regclass, $2, $3)', [s.seq, s.v, s.called]).catch(() => {});
  }

  /** Practice runs sit inside a transaction that is rolled back. If the learner's SQL ends that transaction
   *  (COMMIT, END, ROLLBACK, anywhere in the text), its changes may have been committed, so the practice
   *  state is rebuilt before the next run. Detection asks the database: a SET LOCAL marker disappears when
   *  the transaction ends. After an SQL error the marker cannot be read, so a broad text match is used. */
  private async run(sql: string, { temp = true, verify = '' } = {}): Promise<RunResult> {
    const db = this.need();
    const snap = temp ? await this.seqSnapshot() : [];
    if (temp) { await db.exec('BEGIN'); await db.exec(`SET LOCAL application_name = '${TX_MARK}'`); }
    let failed = false;
    try {
      const t = lastTable(await db.exec(sql));
      const v = verify ? lastTable(await db.exec(verify)) : null;
      return { t, v };
    } catch (e) {
      failed = true;
      throw e;
    } finally {
      if (temp) {
        let ended = failed && TX_WORDS.test(sql);
        if (!failed) {
          try { ended = (await db.query('SHOW application_name')).rows[0].application_name !== TX_MARK; }
          catch { ended = true; }
        }
        await db.exec('ROLLBACK').catch(() => {});
        await this.seqRestore(snap);
        if (ended) this.stateKey = '';
      }
    }
  }

  private async prep(mod: Module, idx: number) {
    await this.buildState(mod, idx);
    await this.applyExamples(mod.lessons[idx], false);
  }

  private async runCodeRaw(code: string): Promise<JsResult> {
    const db = this.need();
    if (!this.jsRunner) this.jsRunner = await this.host.loadJsRunner();
    const snap = await this.seqSnapshot();
    await db.exec('BEGIN');
    try { return await this.jsRunner.runJs(db, code); }
    finally { await db.exec('ROLLBACK').catch(() => {}); await this.seqRestore(snap); }
  }

  // ---------------------------------------------------------------- public operations

  /** Build the lesson state ahead of the first click. */
  prepare(mod: Module, idx: number): Promise<void> {
    return this.serial(() => this.buildState(mod, idx));
  }

  /** "Reset database": rebuild the lesson state. Saved answers and progress are untouched. */
  reset(mod: Module, idx: number): Promise<void> {
    return this.serial(async () => { this.stateKey = ''; await this.buildState(mod, idx); });
  }

  /** Run a worked example. Its original SQL changes the lesson state once, as in the lesson text;
   *  edited SQL runs in a rollback. */
  runExample(mod: Module, idx: number, i: number, sql: string): Promise<ResultTable> {
    return this.serial(async () => {
      await this.buildState(mod, idx);
      const L = mod.lessons[idx], ex = L.examples[i], id = L.id + ':' + i;
      const persist = persistent(ex) && !this.applied.has(id) && sql === ex.sql;
      if (persist) {
        for (let k = 0; k < i; k++) {
          const pid = L.id + ':' + k;
          if (!this.applied.has(pid) && persistent(L.examples[k])) {
            try { await this.db!.exec(L.examples[k].sql!); } catch { /* same as the original course */ }
            this.applied.add(pid);
          }
        }
      }
      const { t } = await this.run(sql, { temp: !persist });
      if (persist) this.applied.add(id);
      return t;
    });
  }

  runExampleJs(mod: Module, idx: number, code: string): Promise<JsResult> {
    return this.serial(async () => { await this.prep(mod, idx); return this.runCodeRaw(code); });
  }

  /** "Common mistakes" run on the lesson state without this lesson's examples, as in the original. */
  runMistake(mod: Module, idx: number, sql: string): Promise<ResultTable> {
    return this.serial(async () => { await this.buildState(mod, idx); return (await this.run(sql)).t; });
  }

  runExercise(mod: Module, idx: number, sql: string, verify = ''): Promise<RunResult> {
    return this.serial(async () => { await this.prep(mod, idx); return this.run(sql, { verify }); });
  }

  /** Grade learner SQL against the model answer, both from the same lesson state. */
  checkExercise(mod: Module, idx: number, sql: string, solution: string, mode: CheckMode | undefined, verify = ''): Promise<CheckResult> {
    return this.serial(async () => {
      await this.prep(mod, idx);
      const mine = await this.run(sql, { verify });
      if (!this.stateKey) await this.prep(mod, idx); // learner SQL ended the practice transaction
      const ref = await this.run(solution, { verify });
      const got = verify ? mine.v! : mine.t;
      return { problem: compare(got, verify ? ref.v! : ref.t, mode), got };
    });
  }

  runJs(mod: Module, idx: number, code: string): Promise<JsResult> {
    return this.serial(async () => { await this.prep(mod, idx); return this.runCodeRaw(code); });
  }

  checkJs(mod: Module, idx: number, code: string, solution: string): Promise<JsCheckResult> {
    return this.serial(async () => {
      await this.prep(mod, idx);
      const mine = await this.runCodeRaw(code);
      if (mine.blocked) return { pass: false, why: '', mine };
      const ref = await this.runCodeRaw(solution);
      const al = mine.logs, bl = ref.logs;
      if (!mine.error && al.join('\n') === bl.join('\n')) return { pass: true, why: '', mine };
      let k = 0;
      while (k < al.length && k < bl.length && al[k] === bl[k]) k++;
      const why = mine.error ? 'Your code stopped with an error.'
        : al.length !== bl.length && k === Math.min(al.length, bl.length) ? `Your code printed ${al.length} line(s); the model answer prints ${bl.length}.`
        : `Line ${k + 1} differs. Expected: ${bl[k] ?? '(nothing)'}`;
      return { pass: false, why, mine };
    });
  }
}
