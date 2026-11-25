// A stand-in for the Supabase project in browser checks: a signed-in test learner and an in-memory
// coursify_progress table. Every request to the real project is answered here, so checks never touch
// real accounts. `install(context, { signedIn, rows, failSaves })` returns the table for assertions.
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
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

export async function install(context, { signedIn = true, rows = [], failSaves = false } = {}) {
  const table = new Map(rows.map(r => [r.course_id, { ...r, user_id: TEST_USER.id }]));
  const state = { table, failSaves, saves: 0, signIns: 0, signedIn };
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
    return json(404, { message: `fake-supabase: no handler for ${req.method()} ${path}` });
  });
  return state;
}
