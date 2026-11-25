// Result normalisation and comparison. Ported unchanged from the original course (legacy.html):
// the 267 model answers are verified against exactly these rules.
import type { CheckMode, ResultTable } from './types';

export interface QueryResult {
  fields?: { name: string }[];
  rows?: Record<string, unknown>[];
  affectedRows?: number;
}

export function norm(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export function toTable(res: QueryResult | undefined): ResultTable | null {
  if (!res || !res.fields || !res.fields.length) return null;
  const cols = res.fields.map(f => f.name);
  return { cols, rows: (res.rows || []).map(r => cols.map(c => norm(r[c]))), affected: res.affectedRows };
}

/** The last statement that returned columns, or an empty table with the last affected-row count. */
export function lastTable(results: QueryResult[]): ResultTable {
  for (let i = results.length - 1; i >= 0; i--) {
    const t = toTable(results[i]);
    if (t) return t;
  }
  const last = results[results.length - 1];
  return { cols: [], rows: [], affected: last ? last.affectedRows : 0 };
}

/** Canonical text of one cell for comparison. Numbers are rounded to 6 decimals. */
export function cell(v: unknown): string {
  if (v === null) return '∅';
  if (typeof v === 'boolean') return v ? 't' : 'f';
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 1e6) / 1e6);
  return s;
}

/** Returns '' when `got` matches `exp` under `mode`, otherwise a learner-facing explanation. */
export function compare(got: ResultTable, exp: ResultTable, mode: CheckMode | undefined): string {
  if (mode === 'rowcount') {
    if (got.rows.length !== exp.rows.length) return `Your query returns ${got.rows.length} row(s); the model answer returns ${exp.rows.length}.`;
    if (got.cols.length !== exp.cols.length) return `Your result has ${got.cols.length} column(s); expected ${exp.cols.length}.`;
    return '';
  }
  if (got.cols.length !== exp.cols.length) return `Your result has ${got.cols.length} column(s): ${got.cols.join(', ') || 'none'}. Expected ${exp.cols.length}: ${exp.cols.join(', ')}.`;
  const a = got.rows.map(r => r.map(cell).join('␟'));
  const b = exp.rows.map(r => r.map(cell).join('␟'));
  if (a.length !== b.length) return `Your query returns ${a.length} row(s); the model answer returns ${b.length}. Check WHERE conditions, joins and DISTINCT.`;
  if (mode === 'ordered') {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `Row ${i + 1} differs. Same rows in a different order, or different values? Check ORDER BY and the columns.`;
    return '';
  }
  const sa = [...a].sort(), sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return 'Same number of rows, but some values differ. Compare your result with the question, column by column.';
  return '';
}
