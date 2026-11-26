// Browser checks for behaviour the grading run does not cover. Needs `npm run preview` running.
// Usage: node tests/ui-check.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { install, TEST_USER, EXAM_KEY } from './fake-supabase.mjs';

const base = process.argv[2] || 'http://localhost:4173/';
const shots = process.argv[3] || 'test-results/ui';
fs.mkdirSync(shots, { recursive: true });
const KEY = 'harbourline-sql-course-v1';          // progress saved before accounts existed
const CACHE = `coursify:sql:${TEST_USER.id}`;       // browser copy of the signed-in learner's progress
const course = JSON.parse(fs.readFileSync('public/courses/sql/course.json', 'utf8'));
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page(opts = {}, init, fake = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  ctx.supabase = await install(ctx, fake);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  return p;
}
const ready = p => p.waitForFunction(() => /ready/.test(document.querySelector('#engine')?.textContent || ''), null, { timeout: 60000 });
const go = async (p, hash) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(400); };
async function newResult(card, action) {
  const res = card.locator('.res').first();
  const before = await res.innerHTML();
  await action();
  await res.evaluate((el, prev) => new Promise(r => { const t = () => el.innerHTML !== prev && el.querySelector('.fb'); if (t()) return r(); const mo = new MutationObserver(() => { if (t()) { mo.disconnect(); r(); } }); mo.observe(el, { childList: true, subtree: true }); }), before);
  return (await res.locator('.fb').first().getAttribute('class')) + ' | ' + (await res.locator('.fb').first().textContent());
}

// 1. Progress saved by the original course is read unchanged.
{
  const legacy = { ex: { 'm02-l1-e1': true }, drafts: { 'm02-l1-e1': 'SELECT policy_number, product, annual_premium FROM policies;', 'm02-l1-e1:tried': true, 'm02-l1-e2:tried': true }, quiz: {}, lessons: { 'm00-l1': true, 'm00-l2': true }, practical: { [course.modules[0].checkpoint.practical.id]: true }, kit: {}, proj: {}, quizBest: { m00: { score: 83, passed: true } } };
  const p = await page({}, { fn: ([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, arg: [KEY, JSON.stringify(legacy)] });
  await p.goto(base + '#m02-l1'); await ready(p);
  const chip = await p.locator('[data-exid="m02-l1-e1"] .status-chip').textContent();
  ok('legacy progress: passed exercise shows Passed', chip.includes('Passed'), chip);
  const chip2 = await p.locator('[data-exid="m02-l1-e2"] .status-chip').textContent();
  ok('legacy progress: tried exercise shows In progress', chip2.includes('In progress'), chip2);
  const draft = await p.locator('[data-exid="m02-l1-e1"] textarea').inputValue();
  ok('legacy progress: draft restored', draft.startsWith('SELECT policy_number'));
  const m0 = await p.locator('#side .toc-mod').first().textContent();
  ok('legacy progress: module 0 completed in sidebar', /completed/.test(await p.locator('#side .toc-mod').first().innerHTML()), m0);
  const stored = JSON.parse(await p.evaluate(k => localStorage.getItem(k), CACHE));
  ok('legacy progress: fields kept after saving', stored.quizBest.m00.score === 83 && stored.lessons['m00-l2'] === true);
  await p.waitForFunction(() => document.querySelector('.banner[data-tone="ok"]'), null, { timeout: 10000 }).catch(() => {});
  const acct = p.context().supabase.table.get('sql')?.progress;
  ok('legacy progress: imported into the account', acct?.quizBest?.m00?.score === 83 && acct.ex['m02-l1-e1'] === true);
  ok('legacy progress: import notice shown', (await p.locator('.banner', { hasText: 'added to your account' }).count()) === 1);
  ok('legacy progress: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.context().close();
}

// 2. Full exercise flow on a fresh profile.
{
  const p = await page();
  await p.goto(base + '#m02-l1'); await ready(p);
  const e = course.modules.find(m => m.id === 'm02').lessons[0].exercises.find(x => x.hint);
  const card = p.locator(`[data-exid="${e.id}"]`);
  await card.scrollIntoViewIfNeeded();
  ok('flow: solution locked before first check', await card.locator('[data-act=sol]').isDisabled());
  let r = await newResult(card, async () => { await card.locator('textarea').fill('SELECT 1 AS x'); await card.locator('[data-act=check]').click(); });
  ok('flow: wrong answer is "Not yet" (warn)', /\bwarn\b/.test(r) && /Not yet/.test(r), r.slice(0, 90));
  ok('flow: status In progress after a check', (await card.locator('.status-chip').textContent()).includes('In progress'));
  r = await newResult(card, () => card.locator('[data-act=hint]').click());
  ok('flow: hint shown', /Hint/.test(r));
  await card.locator('[data-act=sol]').click();
  ok('flow: solution shown and status Solution viewed', (await card.locator('.solution').count()) === 1 && (await card.locator('.status-chip').textContent()).includes('Solution viewed'));
  r = await newResult(card, async () => { await card.locator('textarea').fill(e.solution); await card.locator('[data-act=check]').click(); });
  ok('flow: correct answer passes', /\bok\b/.test(r) && /Correct/.test(r));
  ok('flow: status Passed wins over Solution viewed', (await card.locator('.status-chip').textContent()).includes('Passed'));
  await card.screenshot({ path: `${shots}/exercise-passed.png` });
  // Ctrl+Enter runs; Run does not change the status.
  await card.locator('textarea').fill('SELECT 42 AS answer'); await card.locator('textarea').press('Control+Enter');
  await card.locator('.res td', { hasText: '42' }).waitFor();
  ok('flow: Ctrl+Enter runs the query; Run keeps the Passed status', (await card.locator('.status-chip').textContent()).includes('Passed'));
  await p.reload(); await ready(p);
  const card2 = p.locator(`[data-exid="${e.id}"]`);
  ok('flow: Passed survives reload', (await card2.locator('.status-chip').textContent()).includes('Passed'));
  const st = JSON.parse(await p.evaluate(k => localStorage.getItem(k), CACHE));
  ok('flow: revealed and passed stored separately', st.revealed[e.id] === true && st.ex[e.id] === true);
  // Reset database keeps answers.
  await p.locator('.topbar button', { hasText: 'Reset database' }).click();
  await p.locator('dialog.modal').waitFor();
  ok('reset: confirm dialog has focus on the action', await p.evaluate(() => document.activeElement?.textContent === 'Reset database'));
  await p.keyboard.press('Enter');
  await p.locator('.toast-item', { hasText: 'Database reset' }).waitFor({ timeout: 30000 });
  ok('reset: database reset and progress kept', (await card2.locator('.status-chip').textContent()).includes('Passed'));
  ok('flow: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.context().close();
}

// 3. Keyboard: visible focus on every stop; Esc then Tab leaves the editor.
{
  const p = await page();
  await p.goto(base + '#m02-l1'); await ready(p);
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  let invisible = [], stops = 0;
  for (let i = 0; i < 60; i++) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      return { tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), visible };
    });
    if (!info) continue;
    stops++;
    if (!info.visible) invisible.push(`${info.tag} "${info.text}"`);
  }
  ok('keyboard: every focus stop is visibly focused', invisible.length === 0, `${stops} stops; invisible: ${invisible.slice(0, 5).join(', ')}`);
  const ta = p.locator('[data-exid] textarea').first();
  await ta.focus(); await p.keyboard.press('Tab');
  ok('keyboard: Tab inside editor indents', (await ta.inputValue()).startsWith('  '));
  await p.keyboard.press('Escape'); await p.keyboard.press('Tab');
  ok('keyboard: Esc then Tab leaves the editor', await p.evaluate(() => document.activeElement?.tagName !== 'TEXTAREA'));
  await p.context().close();
}

// 4. Reduced motion: nothing hidden, no animation.
{
  const p = await page({ reducedMotion: 'reduce' });
  await p.goto(base + '#m02-l1'); await ready(p);
  await p.mouse.wheel(0, 4000); await p.waitForTimeout(300);
  const armed = await p.locator('[data-reveal=armed]').count();
  const dur = await p.evaluate(() => getComputedStyle(document.querySelector('.page-enter')).animationDuration);
  ok('reduced motion: no content waiting to be revealed', armed === 0, `armed=${armed}`);
  ok('reduced motion: page animation effectively off', parseFloat(dur) <= 0.001, dur);
  await p.screenshot({ path: `${shots}/reduced-motion.png` });
  await p.context().close();
}

// 5. Motion is present by default.
{
  const p = await page();
  await p.goto(base + '#home'); await ready(p);
  await go(p, 'm02');
  const anim = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.page-enter')); return cs.animationName + ' ' + cs.animationDuration; });
  ok('motion: page transition on navigation', /page-in 0\.36s/.test(anim), anim);
  await go(p, 'm02-l3');
  const before = await p.locator('[data-reveal=armed]').count();
  await p.mouse.wheel(0, 2500); await p.waitForTimeout(800);
  const shown = await p.locator('[data-reveal=shown]').count();
  ok('motion: cards reveal on scroll', before > 0 && shown > 0, `armed before=${before}, shown after=${shown}`);
  await p.context().close();
}

// 6. Mobile: drawer, no horizontal scroll, readable tables.
{
  const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto(base + '#m05-l2'); await ready(p);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('mobile: no horizontal scroll', sw <= 390, `scrollWidth=${sw}`);
  ok('mobile: sidebar hidden by default', !(await p.locator('#side').isVisible()));
  await p.locator('.menu-btn').click(); await p.waitForTimeout(350);
  ok('mobile: menu opens the drawer and moves focus into it', (await p.locator('#side').isVisible()) && await p.evaluate(() => !!document.activeElement?.closest('#side')));
  await p.screenshot({ path: `${shots}/mobile-drawer.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  ok('mobile: Esc closes the drawer and returns focus', !(await p.locator('#side').isVisible()) && await p.evaluate(() => document.activeElement?.classList.contains('menu-btn')));
  await p.locator('[data-exid]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  await p.screenshot({ path: `${shots}/mobile-exercise.png` });
  await p.context().close();
}

// 7. Interactive blocks render and count towards progress.
{
  const p = await page();
  await p.goto(base + '#home'); await ready(p);
  let expected = 0, rendered = 0;
  for (const m of course.modules) for (const L of m.lessons) {
    const n = [...(L.explain + (L.project || '')).matchAll(/data-k="([^"]+)"/g)].filter(x => course.kit[x[1]]).length;
    if (!n) continue;
    expected += n; await go(p, L.id);
    rendered += await p.locator('.kblock > *').count();
  }
  ok('blocks: every embedded block renders', rendered === expected, `${rendered}/${expected}`);
  await go(p, 'm00-l1');
  const stepper = p.locator('.kit', { hasText: 'How it works' }).first();
  if (await stepper.count()) {
    await stepper.scrollIntoViewIfNeeded();
    for (let i = 0; i < 8; i++) { const n = stepper.locator('button', { hasText: 'Next' }); if (await n.isDisabled()) break; await n.click(); }
    ok('blocks: stepper completes and counts', (await stepper.getAttribute('data-done')) === 'true');
  }
  await go(p, 'm02-l1');
  const pres = await p.locator('.prose pre').count(), copies = await p.locator('.prose pre .copy-btn').count();
  ok('content: every code block has a copy button', pres > 0 && pres === copies, `${copies}/${pres}`);
  ok('blocks: no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.context().close();
}

// 8. Checkpoint quiz.
{
  const p = await page();
  await p.goto(base + '#m01-cp'); await ready(p);
  const qs = course.modules.find(m => m.id === 'm01').checkpoint.quiz.filter(q => q.type === 'mc');
  await p.locator('#quizform button[type=submit]').click();
  ok('quiz: asks to answer everything first', /Answer all/.test(await p.locator('#quizresult').textContent()));
  for (const q of qs) await p.locator(`fieldset[data-q="${q.id}"] input[value="${q.options.findIndex(o => o.correct)}"]`).check();
  await p.locator('#quizform button[type=submit]').click();
  await p.locator('.score').waitFor();
  ok('quiz: all correct gives 100% passed', /100%/.test(await p.locator('#quizresult').textContent()) && /Passed/.test(await p.locator('#quizresult').textContent()));
  await p.locator('#quizresult').screenshot({ path: `${shots}/quiz-score.png` });
  const st = JSON.parse(await p.evaluate(k => localStorage.getItem(k), CACHE));
  ok('quiz: best score stored', st.quizBest.m01?.score === 100 && st.quizBest.m01.passed === true);
  await p.context().close();
}

// 9. Failure states are visible and recoverable.
{
  const p = await page();
  await p.route('**/pglite/pglite.wasm', r => r.abort());
  await p.goto(base + '#m02-l1');
  await p.waitForFunction(() => /unavailable/.test(document.querySelector('#engine')?.textContent || ''), null, { timeout: 60000 });
  ok('engine failure: banner shown and lesson still readable', (await p.locator('.banner', { hasText: 'could not start' }).count()) === 1 && (await p.locator('h1').textContent()).includes('SELECT'));
  await p.context().close();
}
{
  const p = await page();
  await p.route('**/courses/sql/course.json', r => r.fulfill({ status: 500, body: 'x' }));
  await p.goto(base + '#home');
  await p.locator('text=could not load').waitFor({ timeout: 15000 });
  ok('content failure: error screen with Try again', (await p.locator('button', { hasText: 'Try again' }).count()) === 1);
  await p.unroute('**/courses/sql/course.json');
  await p.locator('button', { hasText: 'Try again' }).click();
  await p.locator('h1', { hasText: 'SQL & Databases' }).waitFor({ timeout: 15000 });
  ok('content failure: Try again recovers', true);
  await p.context().close();
}
{
  const p = await page({}, { fn: k => { if (!sessionStorage.getItem('s')) { localStorage.setItem(k, '{"ex":{"a":tru'); sessionStorage.setItem('s', '1'); } }, arg: KEY });
  await p.goto(base + '#home'); await ready(p);
  const keys = await p.evaluate(() => Object.keys(localStorage));
  ok('malformed storage: warning shown and backup kept', (await p.locator('.banner', { hasText: 'could not be read' }).count()) === 1 && keys.some(k => k.startsWith(KEY + '-backup-')));
  await p.context().close();
}

// 10. Accounts: sign-in is required, progress follows the account, failures are visible.
{
  const p = await page({}, undefined, { signedIn: false });
  await p.goto(base + '#m02-l1');
  await p.locator('h1', { hasText: 'Sign in' }).waitFor();
  ok('accounts: signed-out visitors see the sign-in form, not the course', (await p.locator('[data-exid]').count()) === 0);
  await p.fill('input[name=email]', 'learner@example.test'); await p.fill('input[name=password]', 'wrong');
  await p.locator('button[type=submit]').click();
  await p.locator('.auth-msg[data-tone=err]').waitFor();
  ok('accounts: wrong password explained', /do not match/.test(await p.locator('.auth-msg').textContent()));
  await p.fill('input[name=password]', 'correct-horse');
  await p.locator('button[type=submit]').click();
  await ready(p);
  ok('accounts: signing in opens the page that was asked for', /SELECT/.test(await p.locator('h1').first().textContent()) && p.url().includes('course=sql'));
  await p.screenshot({ path: `${shots}/signed-in-lesson.png` });
  await p.locator('button', { hasText: 'Sign out' }).click();
  await p.locator('h1', { hasText: 'Sign in' }).waitFor();
  ok('accounts: sign out returns to the sign-in form', true);
  await p.context().close();
}
{
  const p = await page({}, undefined, { signedIn: false });
  await p.goto(base);
  await p.locator('h1', { hasText: 'Sign in' }).waitFor();
  await p.screenshot({ path: `${shots}/sign-in.png` });
  await p.locator('button', { hasText: 'Create an account' }).click();
  ok('accounts: sign-up form asks for a new password', (await p.locator('h1').textContent()).includes('Create') && (await p.locator('input[autocomplete=new-password]').count()) === 1);
  await p.locator('button', { hasText: 'Back to sign in' }).click();
  await p.locator('button', { hasText: 'Forgot password?' }).click();
  ok('accounts: password reset form has no password field', (await p.locator('input[type=password]').count()) === 0);
  await p.context().close();
}
{
  const p = await page();
  await p.goto(base);
  await p.locator('h1', { hasText: 'Courses' }).waitFor();
  const cards = await p.locator('.catalog-card').count();
  ok('catalogue: lists the courses', cards >= 1 && (await p.locator('.catalog-card h2').first().textContent()).includes('SQL') && /\d+ modules/.test(await p.locator('.catalog-card').first().textContent()));
  await p.screenshot({ path: `${shots}/catalogue.png` });
  await p.locator('.catalog-card a', { hasText: 'Open course' }).first().click();
  await ready(p);
  ok('catalogue: opening a course shows its home page', (await p.locator('h1').first().textContent()).includes('SQL & Databases'));
  await p.locator('a', { hasText: 'All courses' }).click();
  await p.locator('h1', { hasText: 'Courses' }).waitFor();
  ok('catalogue: All courses returns to the list', true);
  await p.goto(base + '?course=nope');
  await p.locator('.banner', { hasText: 'does not exist' }).waitFor();
  ok('catalogue: unknown course explained', true);
  await p.context().close();
}
{
  // Progress made in one browser is there in another.
  const a = await page();
  await a.goto(base + '#m00-l1'); await ready(a);
  const mark = a.locator('button', { hasText: /Mark.*done|Mark as done/ }).first();
  const marked = (await mark.count()) > 0;
  if (marked) await mark.click();
  else await a.evaluate(() => { location.hash = 'm00-l2'; });
  await a.waitForFunction(() => !document.querySelector('.banner[data-tone=warn]'), null, { timeout: 5000 }).catch(() => {});
  await a.waitForTimeout(1500);
  const row = a.context().supabase.table.get('sql');
  ok('sync: progress reaches the account', !!row && (marked ? row.progress.lessons?.['m00-l1'] === true : row.progress.last === 'm00-l2'));
  const b = await page({}, undefined, { rows: row ? [row] : [] });
  await b.goto(base + '#home'); await ready(b);
  ok('sync: another device starts from the account copy', marked ? (await b.locator('#side .toc-tick[data-done=true]').count()) >= 1 : /Continue/.test(await b.locator('.hero').textContent()));
  await a.context().close(); await b.context().close();
}
{
  const p = await page({}, undefined, { failSaves: true });
  await p.goto(base + '#m02-l1'); await ready(p);
  const card = p.locator('[data-exid]').first();
  await card.locator('textarea').fill('SELECT 1');
  await p.locator('.banner', { hasText: 'not reached your account' }).waitFor({ timeout: 10000 });
  ok('sync: a failed save is shown', true);
  const cached = await p.evaluate(k => localStorage.getItem(k + ':unsynced'), CACHE);
  ok('sync: unsent changes are kept in the browser', cached === '1');
  p.context().supabase.failSaves = false;
  await p.locator('.banner', { hasText: 'not reached your account' }).waitFor({ state: 'detached', timeout: 20000 });
  ok('sync: retried and saved once the account is reachable', p.context().supabase.table.has('sql'));
  await p.context().close();
}

// 11. Final exam and certificate.
const allPassed = { ex: {}, drafts: {}, quiz: {}, lessons: {}, kit: {}, proj: {}, quizBest: {}, revealed: {},
  practical: Object.fromEntries(course.modules.filter(m => m.checkpoint?.practical).map(m => [m.checkpoint.practical.id, true])) };
const doneRow = [{ course_id: 'sql', progress: allPassed, updated_at: new Date().toISOString() }];
{
  const p = await page();
  await p.goto(base + '#exam'); await ready(p);
  await p.locator('h2', { hasText: 'Finish the course first' }).waitFor();
  ok('exam: locked until every checkpoint is passed', (await p.locator('.exam-missing li').count()) === course.modules.filter(m => m.kind === 'core' && m.checkpoint?.practical).length
    && (await p.locator('button', { hasText: 'Start the exam' }).count()) === 0);
  ok('exam: sidebar shows the exam and certificate', (await p.locator('#side a[href="#exam"]').count()) === 1 && (await p.locator('#side a[href="#certificate"]').count()) === 1);
  await p.goto(base + '#certificate');
  await p.locator('h2', { hasText: 'No certificate yet' }).waitFor();
  ok('certificate: none before passing', true);
  await p.context().close();
}
{
  // Failing attempt: result per module and a retake time.
  const p = await page({}, undefined, { rows: doneRow });
  await p.goto(base + '#exam'); await ready(p);
  await p.locator('button', { hasText: 'Start the exam' }).click();
  await p.locator('.auth-msg[data-tone=err]').waitFor();
  ok('exam: asks for a name for the certificate', /full name/i.test(await p.locator('.auth-msg').textContent()));
  await p.fill('#exam-full-name', 'Anna de Vries');
  await p.locator('button', { hasText: 'Start the exam' }).click();
  await p.locator('.exam-q').first().waitFor();
  ok('exam: questions shown with timer', (await p.locator('.exam-q').count()) === 3 && /left/.test(await p.locator('.exam-timer').textContent()));
  ok('exam: questions carry no answers', !(await p.content()).includes('"correct"'));
  await p.locator('.exam-q[data-qid="sql:t-single"] .exam-opt').nth(0).click();
  await p.waitForTimeout(1600);
  ok('exam: answers autosave', (p.context().supabase.examSaves || 0) >= 1);
  await p.locator('.exam-bar button', { hasText: 'Hand in' }).click();
  await p.locator('dialog.modal').waitFor();
  ok('exam: warns about unanswered questions', /2 question/.test(await p.locator('dialog.modal').textContent()));
  await p.locator('dialog.modal button', { hasText: 'Hand in' }).click();
  await p.locator('.exam-result').waitFor();
  ok('exam: failed result with retake time and module breakdown', /not passed/.test(await p.locator('.exam-result h2').textContent())
    && /try again from/.test(await p.locator('.exam-result').textContent()) && (await p.locator('.exam-topics li').count()) === 2);
  await p.screenshot({ path: `${shots}/exam-failed.png`, fullPage: true });
  await p.context().close();
}
{
  // Passing attempt, certificate, public verification.
  const p = await page({}, undefined, { rows: doneRow, fullName: 'Anna de Vries' });
  await p.goto(base + '#exam'); await ready(p);
  ok('exam: name remembered', (await p.inputValue('#exam-full-name')) === 'Anna de Vries');
  await p.locator('button', { hasText: 'Start the exam' }).click();
  await p.locator('.exam-q').first().waitFor();
  await p.locator('.exam-q[data-qid="sql:t-single"] .exam-opt').nth(EXAM_KEY['sql:t-single']).click();
  for (const i of EXAM_KEY['sql:t-multi']) await p.locator('.exam-q[data-qid="sql:t-multi"] .exam-opt').nth(i).click();
  const vq = p.locator('.exam-q[data-qid="sql:t-value"]');
  await vq.locator('summary').click();
  await vq.locator('textarea').fill('SELECT count(*) FROM policies WHERE end_date IS NULL');
  await vq.locator('button', { hasText: 'Run' }).click();
  await vq.locator('.res td, table td', { hasText: '155' }).first().waitFor({ timeout: 30000 });
  ok('exam: practice database runs queries on the course data', true);
  await vq.locator('input[inputmode=decimal]').fill('155');
  await p.screenshot({ path: `${shots}/exam-running.png`, fullPage: true });
  await p.locator('.exam-bar button', { hasText: 'Hand in' }).click();
  await p.locator('dialog.modal button', { hasText: 'Hand in' }).click();
  await p.locator('.exam-result').waitFor();
  ok('exam: passed with 100%', /Passed with 100%/.test(await p.locator('.exam-result h2').textContent()));
  await p.locator('a', { hasText: 'View your certificate' }).first().click();
  await p.locator('.certificate').waitFor();
  const cert = await p.locator('.certificate').textContent();
  ok('certificate: name, course, score and code', cert.includes('Anna de Vries') && cert.includes('SQL & Databases') && cert.includes('100%') && cert.includes('CFY-TEST-0001'));
  await p.screenshot({ path: `${shots}/certificate.png`, fullPage: true });
  await p.emulateMedia({ media: 'print' });
  ok('certificate: printing hides the app around it', !(await p.locator('#side').isVisible()) && !(await p.locator('.topbar').isVisible()) && await p.locator('.certificate').isVisible());
  await p.emulateMedia({ media: 'screen' });
  await p.goto(base + '#exam');
  await p.locator('h2', { hasText: 'You passed' }).waitFor();
  ok('exam: after passing, no second attempt is offered', (await p.locator('button', { hasText: 'Start the exam' }).count()) === 0);
  await p.goto(base);
  await p.locator('.catalog-card').first().waitFor();
  ok('catalogue: shows the course as certified', /Certified · 100%/.test(await p.locator('.catalog-card').first().textContent()));
  const certs = p.context().supabase.certificates;
  await p.context().close();

  const v = await page({}, undefined, { signedIn: false, certificates: certs });
  await v.goto(base + '?verify=cfy-test-0001');
  await v.locator('.banner', { hasText: 'genuine' }).waitFor();
  ok('verify: anyone can check a code without signing in', (await v.locator('.certificate').textContent()).includes('Anna de Vries') && (await v.locator('input[name=password]').count()) === 0);
  await v.screenshot({ path: `${shots}/verify.png`, fullPage: true });
  await v.goto(base + '?verify=CFY-NOPE-0000');
  await v.locator('.banner', { hasText: 'No certificate' }).waitFor();
  ok('verify: unknown code explained', true);
  await v.context().close();
}

await browser.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
