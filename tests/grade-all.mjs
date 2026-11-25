// Fill every model answer into the real page and press Check. Reports pass/fail per exercise.
import { chromium } from 'playwright';
import fs from 'node:fs';
// Usage: node tests/grade-all.mjs [pageUrl] [resultFile]
// Default checks the original course (legacy.html) on a running `npm run preview`.
const base = process.argv[2] || "http://localhost:4173/legacy.html";
const out = process.argv[3] || "test-results/grading.json";
const root = "public";
fs.mkdirSync("test-results", { recursive: true });
const course = JSON.parse(fs.readFileSync(root + '/data/course.json', 'utf8'));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base + '#home'); await p.waitForFunction(() => /ready/.test(document.querySelector('#engine')?.textContent || ''), null, { timeout: 60000 });
const results = [];
async function check(card, answer) {
  await card.locator('textarea').first().fill(answer);
  await card.locator('[data-act=check]').click();
  const fb = card.locator('.res .fb').first();
  await fb.waitFor({ timeout: 60000 });
  return { cls: (await fb.getAttribute('class')).replace('fb ', ''), text: (await fb.textContent()).slice(0, 160) };
}
for (const m of course.modules) {
  for (const L of m.lessons) {
    await p.evaluate(h => location.hash = h, L.id); await p.waitForSelector(`[data-exid]`);
    for (const e of L.exercises) {
      if (e.check === 'manual') continue;
      const card = p.locator(`[data-exid="${e.id}"]`);
      const r = await check(card, e.check === 'js' ? e.jsSolution : e.solution);
      results.push({ id: e.id, lesson: L.id, check: e.check, verify: !!e.verify, ...r });
    }
  }
  if (m.checkpoint) {
    await p.evaluate(h => location.hash = h, m.id + '-cp'); await p.waitForTimeout(300);
    const pr = m.checkpoint.practical;
    if (pr) { const r = await check(p.locator('#prac'), pr.check === 'js' ? pr.jsSolution : pr.solution); results.push({ id: pr.id, lesson: m.id + '-cp', check: pr.check, ...r }); }
    for (const q of m.checkpoint.quiz.filter(q => q.type === 'write')) {
      const card = p.locator(`.card[data-q="${q.id}"]`); const r = await check(card, q.solution); results.push({ id: q.id, lesson: m.id + '-cp', check: q.check, ...r });
    }
  }
  console.error(m.id, 'done', results.length);
}
// Known-wrong answers must not pass
await p.evaluate(h => location.hash = h, 'm02-l1'); await p.waitForSelector('[data-exid]');
const firstEx = course.modules.find(m => m.id === 'm02').lessons[0].exercises.find(e => e.check !== 'manual');
const wrong = await check(p.locator(`[data-exid="${firstEx.id}"]`), 'SELECT 1 AS x');
const syntax = await check(p.locator(`[data-exid="${firstEx.id}"]`), 'SELEC nonsense');
fs.writeFileSync(out, JSON.stringify({ results, wrong, syntax, pageErrors: errs }, null, 1));
const bad = results.filter(r => !r.cls.split(' ').includes('ok'));
console.log(`checked ${results.length}, passed ${results.length - bad.length}, failed ${bad.length}`);
bad.forEach(r => console.log(' FAIL', r.id, r.check, r.cls, r.text));
console.log('wrong answer ->', wrong.cls, '| syntax error ->', syntax.cls, '| page errors', errs.length);
await b.close();
process.exitCode = bad.length || wrong.cls !== 'err' || syntax.cls !== 'err' || errs.length ? 1 : 0;
