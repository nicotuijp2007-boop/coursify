// A stand-in for the Supabase project in browser checks: a signed-in test learner and an in-memory
// coursify_progress table. Every request to the real project is answered here, so checks never touch
// real accounts. `install(context, { signedIn, rows, failSaves })` returns the table for assertions.

const env = { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://nbeejssppyaikhveogip.supabase.co' };
export const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
export const SESSION_KEY = `sb-${ref}-auth-token`;
export const TEST_USER = { id: '00000000-0000-4000-8000-00000000c0de', email: 'learner@example.test', aud: 'authenticated', role: 'authenticated' };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: TEST_USER.id, role: 'authenticated', aud: 'authenticated', exp, email: TEST_USER.email })}.sig`;
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'test-refresh', user: TEST_USER };
}

// A tiny exam: three questions and their answers, graded here the way the real database grades them.
export const EXAM_KEY = { 'sql:t-single': 1, 'sql:t-multi': [0, 2], 'sql:t-value': { value: 155, tolerance: 0 } };
const EXAM_QUESTIONS = [
  { id: 'sql:t-single', topic: 'm02', topic_title: 'Module 2 · Querying one table', kind: 'single', prompt: '<p>Which keyword sorts rows?</p>', options: ['GROUP BY', 'ORDER BY', 'LIMIT'] },
  { id: 'sql:t-multi', topic: 'm02', topic_title: 'Module 2 · Querying one table', kind: 'multi', prompt: '<p>Which find NULL cities?</p>', options: ['<code>city IS NULL</code>', '<code>city = NULL</code>', '<code>NOT (city IS NOT NULL)</code>'] },
  { id: 'sql:t-value', topic: 'm05', topic_title: 'Module 5 · Joins and cardinality', kind: 'value', prompt: '<p>How many policies have no end date?</p>', options: [] },
];
const sameSet = (a, b) => Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function gradeOne(id, ans) {
  const k = EXAM_KEY[id];
  if (Array.isArray(k)) return sameSet(ans, k);
  if (typeof k === 'object') { const n = Number(String(ans ?? '').replace(',', '.')); return Math.abs(n - k.value) <= k.tolerance; }
  return ans === k;
}

export async function install(context, { signedIn = true, rows = [], failSaves = false, exam = true, fullName = '', certificates = [] } = {}) {
  const table = new Map(rows.map(r => [r.course_id, { ...r, user_id: TEST_USER.id }]));
  const state = { table, failSaves, saves: 0, signIns: 0, signedIn, profile: fullName ? { full_name: fullName } : null, attempts: [], certificates: [...certificates] };
  if (signedIn) await context.addInitScript(([k, v]) => { if (!localStorage.getItem(k) && !sessionStorage.getItem('signed-out')) localStorage.setItem(k, v); }, [SESSION_KEY, JSON.stringify(session())]);
  await context.route(SUPABASE_URL + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
    if (path === '/auth/v1/user') return json(200, TEST_USER);
    if (path === '/auth/v1/token') {
      const body = req.postDataJSON() || {};
      if (url.searchParams.get('grant_type') === 'password') {
        state.signIns++;
        return body.password === 'correct-horse' ? json(200, session()) : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      return json(200, session());
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/rest/v1/coursify_progress') {
      if (req.method() === 'GET') {
        const course = url.searchParams.get('course_id')?.replace(/^eq\./, '');
        return json(200, [...table.values()].filter(r => !course || r.course_id === course));
      }
      if (req.method() === 'POST') {
        if (state.failSaves) return json(503, { message: 'unavailable' });
        const body = req.postDataJSON();
        for (const r of Array.isArray(body) ? body : [body]) table.set(r.course_id, r);
        state.saves++;
        return json(201);
      }
    }
    if (path === '/rest/v1/coursify_exams') return json(200, exam ? [{ course_id: 'sql', title: 'SQL & Databases with PostgreSQL', questions_per_topic: 2, pass_percent: 75, time_limit_minutes: 60, cooldown_hours: 24 }] : []);
    if (path === '/rest/v1/coursify_exam_attempts') return json(200, state.attempts.map(({ answers, question_ids, ...a }) => a));
    if (path === '/rest/v1/coursify_certificates') return json(200, state.certificates.map(({ code, full_name, course_title, score, issued_at, course_id }) => ({ code, full_name, course_title, score, issued_at, course_id })));
    if (path === '/rest/v1/coursify_profiles') {
      if (req.method() === 'GET') return json(200, state.profile ? [state.profile] : []);
      state.profile = { full_name: req.postDataJSON().full_name }; return json(201);
    }
    const rpc = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null;
    const rpcError = msg => json(400, { code: 'P0001', message: msg, details: null, hint: null });
    if (rpc === 'coursify_exam_start') {
      if (!state.profile) return rpcError('Enter your full name for the certificate first.');
      if (state.certificates.length) return rpcError('You already passed this exam.');
      let a = state.attempts.find(x => !x.submitted_at);
      if (!a) { a = { id: 'att-' + (state.attempts.length + 1), started_at: new Date().toISOString(), deadline: new Date(Date.now() + 3600e3).toISOString(), submitted_at: null, score: null, passed: null, breakdown: null, answers: {} }; state.attempts.unshift(a); }
      return json(200, { attempt_id: a.id, started_at: a.started_at, deadline: a.deadline, answers: a.answers, questions: EXAM_QUESTIONS });
    }
    if (rpc === 'coursify_exam_save') { const b = req.postDataJSON(); const a = state.attempts.find(x => x.id === b.p_attempt); if (a) a.answers = b.p_answers; state.examSaves = (state.examSaves || 0) + 1; return json(200, null); }
    if (rpc === 'coursify_exam_submit') {
      const b = req.postDataJSON(); const a = state.attempts.find(x => x.id === b.p_attempt);
      const per = {}; let ok = 0;
      for (const q of EXAM_QUESTIONS) { const good = gradeOne(q.id, b.p_answers[q.id]); ok += good ? 1 : 0; const t = per[q.topic] ??= { topic: q.topic, title: q.topic_title, correct: 0, total: 0 }; t.total++; if (good) t.correct++; }
      const score = Math.floor(100 * ok / EXAM_QUESTIONS.length), passed = score >= 75;
      Object.assign(a, { submitted_at: new Date().toISOString(), score, passed, breakdown: Object.values(per), answers: b.p_answers });
      if (passed) state.certificates.push({ code: 'CFY-TEST-0001', course_id: 'sql', full_name: state.profile.full_name, course_title: 'SQL & Databases with PostgreSQL', score, issued_at: a.submitted_at });
      return json(200, { attempt_id: a.id, submitted_at: a.submitted_at, correct: ok, total: EXAM_QUESTIONS.length, score, passed, pass_percent: 75, breakdown: Object.values(per),
        retake_after: passed ? null : new Date(Date.now() + 24 * 3600e3).toISOString(), certificate_code: passed ? 'CFY-TEST-0001' : null });
    }
    if (rpc === 'coursify_certificate_verify') {
      const c = state.certificates.find(x => x.code === String(req.postDataJSON().p_code).toUpperCase());
      return json(200, c ? { valid: true, code: c.code, full_name: c.full_name, course_title: c.course_title, score: c.score, issued_at: c.issued_at } : { valid: false });
    }
    return json(404, { message: `fake-supabase: no handler for ${req.method()} ${path}` });
  });
  return state;
}
