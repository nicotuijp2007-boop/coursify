// A small stand-in for supabase-js, running against the in-page PostgreSQL (PGlite).
// It covers the calls the course uses: from().select/insert/update/delete/upsert with filters,
// order, limit, single/maybeSingle, and rpc(). Results have the same { data, error } shape.
// Values come back the way PostgREST sends them: numeric and bigint as JS numbers, timestamps as ISO text.

const IDENT = /^[a-z_][a-z0-9_]*$/;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };

function q(id) {
  if (!IDENT.test(id)) throw Object.assign(new Error(`invalid name "${id}"`), { code: 'PGRST100' });
  return '"' + id + '"';
}
function columns(list) {
  const s = String(list || '*').trim();
  if (s === '*') return '*';
  return s.split(',').map(c => c.trim()).filter(Boolean).map(c => {
    const m = c.match(/^([a-z_][a-z0-9_]*)\s*:\s*([a-z_][a-z0-9_]*)$/);
    return m ? `${q(m[2])} AS ${q(m[1])}` : q(c);
  }).join(', ');
}
function convert(res) {
  const fields = res.fields || [];
  return (res.rows || []).map(r => {
    const o = {};
    for (const f of fields) {
      let v = r[f.name];
      if (v !== null && v !== undefined) {
        if (f.dataTypeID === 1700 || f.dataTypeID === 20) v = Number(v);
        else if (f.dataTypeID === 1184 && typeof v === 'string') v = v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
        else if (f.dataTypeID === 1184 && v instanceof Date) v = v.toISOString().replace('Z', '+00:00');
      }
      o[f.name] = v;
    }
    return o;
  });
}
function pgError(e) {
  return { message: e.message, code: e.code || 'PGRST000', details: e.detail || null, hint: e.hint || null };
}

class Builder {
  constructor(db, table) {
    this.db = db; this.table = table; this.op = 'select'; this.cols = '*'; this.where = []; this.params = [];
    this.orders = []; this.lim = null; this.mode = 'many'; this.returning = null; this.values = null; this.countMode = null; this.onConflict = null;
  }
  p(v) { this.params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return '$' + this.params.length; }
  select(cols = '*', opts = {}) { if (this.op === 'select') this.cols = cols; else this.returning = cols; if (opts.count) this.countMode = opts.count; return this; }
  insert(values) { this.op = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this; }
  upsert(values, opts = {}) { this.op = 'insert'; this.values = Array.isArray(values) ? values : [values]; this.onConflict = opts.onConflict || ''; this.ignore = !!opts.ignoreDuplicates; return this; }
  update(values) { this.op = 'update'; this.values = values; return this; }
  delete() { this.op = 'delete'; return this; }
  filter(col, op, val) { this.where.push(() => `${q(col)} ${op} ${this.p(val)}`); return this; }
  in(col, list) { this.where.push(() => { this.params.push(list); return `${q(col)} = ANY($${this.params.length})`; }); return this; }
  is(col, val) { this.where.push(() => `${q(col)} IS ${val === null ? 'NULL' : val ? 'TRUE' : 'FALSE'}`); return this; }
  match(obj) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  order(col, opts = {}) { this.orders.push(`${q(col)} ${opts.ascending === false ? 'DESC' : 'ASC'}${opts.nullsFirst ? ' NULLS FIRST' : ''}`); return this; }
  limit(n) { this.lim = Number(n); return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  whereSql() { const w = this.where.map(f => f()); return w.length ? ' WHERE ' + w.join(' AND ') : ''; }
  sql() {
    const t = q(this.table);
    const ret = this.returning ? ' RETURNING ' + columns(this.returning) : '';
    if (this.op === 'select') {
      let s = `SELECT ${columns(this.cols)} FROM ${t}${this.whereSql()}`;
      if (this.orders.length) s += ' ORDER BY ' + this.orders.join(', ');
      if (this.lim !== null) s += ' LIMIT ' + Math.max(0, Math.floor(this.lim));
      return s;
    }
    if (this.op === 'insert') {
      const keys = [...new Set(this.values.flatMap(v => Object.keys(v)))];
      const rows = this.values.map(v => '(' + keys.map(k => (k in v ? this.p(v[k]) : 'DEFAULT')).join(', ') + ')');
      let s = `INSERT INTO ${t} (${keys.map(q).join(', ')}) VALUES ${rows.join(', ')}`;
      if (this.onConflict !== null) {
        const target = this.onConflict ? ' (' + this.onConflict.split(',').map(c => q(c.trim())).join(', ') + ')' : '';
        s += this.ignore || !keys.length ? ` ON CONFLICT${target} DO NOTHING` : ` ON CONFLICT${target} DO UPDATE SET ` + keys.map(k => `${q(k)} = EXCLUDED.${q(k)}`).join(', ');
      }
      return s + ret;
    }
    if (!this.where.length) throw Object.assign(new Error(`${this.op.toUpperCase()} requires a WHERE clause`), { code: '21000' });
    if (this.op === 'update') {
      const sets = Object.entries(this.values).map(([k, v]) => `${q(k)} = ${this.p(v)}`).join(', ');
      return `UPDATE ${t} SET ${sets}${this.whereSql()}${ret}`;
    }
    return `DELETE FROM ${t}${this.whereSql()}${ret}`;
  }
  async exec() {
    try {
      this.params = [];
      const sql = this.sql();
      const res = await isolated(this.db, () => this.db.query(sql, this.params));
      let data = this.op === 'select' || this.returning ? convert(res) : null;
      let count = null;
      if (this.countMode) count = this.op === 'select' ? data.length : res.affectedRows;
      if (this.mode !== 'many' && data) {
        if (data.length > 1 || (this.mode === 'single' && data.length === 0))
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${data.length} rows`, hint: null }, count, status: 406 };
        data = data[0] ?? null;
      }
      return { data, error: null, count, status: this.op === 'insert' ? 201 : 200 };
    } catch (e) {
      return { data: null, error: pgError(e), count: null, status: 400 };
    }
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
}
for (const [name, op] of Object.entries(OPS)) Builder.prototype[name] = function (col, val) { return this.filter(col, op, val); };

// Each call runs like its own API request: a failed call must not break the calls after it.
// The course runs learner code inside one transaction, so every call gets its own savepoint.
async function isolated(db, fn) {
  let sp = true;
  try { await db.exec('SAVEPOINT api_call'); } catch (e) { sp = false; }
  try { const r = await fn(); if (sp) await db.exec('RELEASE SAVEPOINT api_call'); return r; }
  catch (e) { if (sp) await db.exec('ROLLBACK TO SAVEPOINT api_call').catch(() => {}); throw e; }
}

export function makeClient(db) {
  return {
    from: table => new Builder(db, table),
    rpc: async (fn, args = {}) => {
      try {
        const params = [];
        const named = Object.entries(args).map(([k, v]) => { params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `${q(k)} => $${params.length}`; });
        const res = await isolated(db, () => db.query(`SELECT * FROM ${q(fn)}(${named.join(', ')})`, params));
        const rows = convert(res);
        const scalar = res.fields.length === 1 && res.fields[0].name === fn && rows.length === 1;
        return { data: scalar ? rows[0][fn] : rows, error: null, status: 200 };
      } catch (e) { return { data: null, error: pgError(e), status: 400 }; }
    }
  };
}

export function fmt(v) {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[function]';
  if (v instanceof Error) return v.name + ': ' + v.message;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

// Runs learner code as the body of an async function with `supabase` and `console` in scope.
export async function runJs(db, code) {
  const logs = [];
  const cons = { log: (...a) => logs.push(a.map(fmt).join(' ')), error: (...a) => logs.push(a.map(fmt).join(' ')), warn: (...a) => logs.push(a.map(fmt).join(' ')), table: v => logs.push(fmt(v)) };
  let AsyncFunction;
  try { AsyncFunction = Object.getPrototypeOf(async function () {}).constructor; new AsyncFunction('return 1'); }
  catch (e) { return { logs, error: 'This browser blocks running typed-in JavaScript here. Run the code in your own editor (Module 11 sets one up) and compare with the expected output.', blocked: true }; }
  try {
    const f = new AsyncFunction('supabase', 'console', '"use strict";\n' + code);
    await f(makeClient(db), cons);
    return { logs, error: null };
  } catch (e) {
    return { logs, error: (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e)) };
  }
}
