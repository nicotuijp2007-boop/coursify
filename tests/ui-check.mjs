// Browser checks for behaviour the grading run does not cover. Needs `npm run preview` running.
// Usage: node tests/ui-check.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4173/';
const shots = process.argv[3] || 'test-results/ui';
fs.mkdirSync(shots, { recursive: true });
const KEY = 'harbourline-sql-course-v1';
const course = JSON.parse(fs.readFileSync('public/data/course.json', 'utf8'));
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
async function page(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
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
  const stored = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY));
  ok('legacy progress: fields kept after saving', stored.quizBest.m00.score === 83 && stored.lessons['m00-l2'] === true);
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
  const st = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY));
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
  const st = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY));
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
  await p.route('**/data/course.json', r => r.fulfill({ status: 500, body: 'x' }));
  await p.goto(base + '#home');
  await p.locator('text=could not load').waitFor({ timeout: 15000 });
  ok('content failure: error screen with Try again', (await p.locator('button', { hasText: 'Try again' }).count()) === 1);
  await p.unroute('**/data/course.json');
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

await browser.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
