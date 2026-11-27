// The course builder: plan (read material, design the outline), build (write lessons, checkpoints and exam
// questions, then check and assemble), install (put the course on the site). Files of one course live in
// course-src/<id>/: brief.yaml, sources/, work/ (intermediate results) and out/ (the finished course).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { pool, totalCost, type Model } from './model';
import { Brief, CheckpointDraft, ExamDraft, LessonDraft, Outline } from './schemas';
import { packText, readSources, type SourcePack } from './sources';
import { checkCheckpoint, checkExam, checkLesson, checkOutline, clean } from './checks';
import * as P from './prompts';

type Log = (s: string) => void;
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f: string, v: unknown) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n'); };
const money = (n: number) => `$${n.toFixed(2)}`;

export function loadBrief(dir: string): Brief {
  const f = path.join(dir, 'brief.yaml');
  if (!fs.existsSync(f)) throw new Error(`No brief found at ${f}. Run "npm run course -- new <id>" to start one.`);
  const r = Brief.safeParse(parseYaml(fs.readFileSync(f, 'utf8')));
  if (!r.success) throw new Error(`brief.yaml is not valid:\n${r.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return r.data;
}

function recordCost(dir: string, step: string, model: Model, from: number) {
  const f = path.join(dir, 'work', 'costs.json');
  const prev = fs.existsSync(f) ? read<{ step: string; at: string; calls: number; cost: number }[]>(f) : [];
  const calls = model.log.slice(from);
  prev.push({ step, at: new Date().toISOString(), calls: calls.length, cost: Number(totalCost(calls).toFixed(4)) });
  write(f, prev);
}

// ------------------------------------------------------------------ plan

export async function plan(dir: string, model: Model, log: Log): Promise<Outline> {
  const brief = loadBrief(dir);
  const from = model.log.length;
  log(`Reading the material in ${path.join(dir, 'sources')}…`);
  const pack = await readSources(dir, model, log);
  write(path.join(dir, 'work', 'sources.json'), pack);
  const ids = new Set(pack.passages.map(p => p.id));
  log(`Designing the outline (${pack.passages.length} passages)…`);
  const outline = await model.call({
    role: 'architect', label: 'outline', maxTokens: 32000,
    system: P.ARCHITECT_SYSTEM, cached: P.sharedContext(brief, packText(pack)), prompt: P.ARCHITECT_TASK(brief),
    schema: Outline, check: o => checkOutline(o, ids, { modules: brief.modules, lessons: brief.lessons_per_module }),
  });
  write(path.join(dir, 'work', 'outline.json'), outline);
  write(path.join(dir, 'work', 'outline.md'), outlineMarkdown(outline));
  recordCost(dir, 'plan', model, from);
  log(`Outline: ${outline.modules.length} modules, ${outline.modules.reduce((a, m) => a + m.lessons.length, 0)} lessons. Cost so far ${money(totalCost(model.log.slice(from)))}.`);
  if (outline.gaps.length) log(`The material is thin on: ${outline.gaps.join('; ')}`);
  return outline;
}

export function outlineMarkdown(o: Outline): string {
  const lines = [`# ${o.title}`, '', o.lead, '', '**After this course you can**', ...o.outcomes.map(x => `- ${x}`), ''];
  o.modules.forEach((m, i) => {
    lines.push(`## Module ${i + 1} · ${m.title}`, '', m.summary, '', 'Objectives:', ...m.objectives.map(x => `- ${x}`), '');
    m.lessons.forEach((l, j) => lines.push(`### ${i + 1}.${j + 1} ${l.title} (${l.minutes} min)`, l.goal, ...l.key_points.map(k => `- ${k}`), `Sources: ${l.source_ids.join(', ')}`, ''));
  });
  if (o.gaps.length) lines.push('## Gaps in the material', ...o.gaps.map(g => `- ${g}`), '');
  lines.push('---', 'To change the course, edit work/outline.json (not this file), then run build.');
  return lines.join('\n');
}

// ------------------------------------------------------------------ build

interface Ids { modId: string; lessonIds: string[] }

export async function build(dir: string, model: Model, log: Log, { concurrency = 4 } = {}) {
  const brief = loadBrief(dir);
  const from = model.log.length;
  const pack = read<SourcePack>(path.join(dir, 'work', 'sources.json'));
  const outline = Outline.parse(read(path.join(dir, 'work', 'outline.json')));
  const known = new Set(pack.passages.map(p => p.id));
  const outlineProblems = checkOutline(outline, known, { modules: outline.modules.length, lessons: brief.lessons_per_module });
  if (outlineProblems.length) throw new Error(`work/outline.json has problems; fix them first:\n- ${outlineProblems.join('\n- ')}`);
  const ctx = P.sharedContext(brief, packText(pack));
  const ids: Ids[] = outline.modules.map((m, i) => ({ modId: `m${String(i + 1).padStart(2, '0')}`, lessonIds: m.lessons.map((_, j) => `m${String(i + 1).padStart(2, '0')}-l${j + 1}`) }));
  const flat = outline.modules.flatMap((m, i) => m.lessons.map((l, j) => ({ m, i, l, j })));
  const titles = flat.map(x => `${x.i + 1}.${x.j + 1} ${x.l.title}`);

  // Write the first lesson alone so the shared context is cached before the others read it.
  log(`Writing ${flat.length} lessons…`);
  const writeLesson = async (x: (typeof flat)[number], k: number) => {
    const draft = await model.call({
      role: 'writer', label: `lesson ${x.i + 1}.${x.j + 1}`, system: P.WRITER_SYSTEM, cached: ctx, schema: LessonDraft,
      prompt: P.WRITER_TASK({ module: x.m.title, objectives: x.m.objectives, lessonNo: `${x.i + 1}.${x.j + 1}`, title: x.l.title, goal: x.l.goal,
        minutes: x.l.minutes, keyPoints: x.l.key_points, sourceIds: x.l.source_ids, before: titles.slice(0, k), after: titles.slice(k + 1) }),
      check: d => checkLesson(d, new Set(x.l.source_ids)),
    });
    log(`  ✓ ${titles[k]}`);
    return draft;
  };
  const lessons: LessonDraft[] = flat.length ? [await writeLesson(flat[0], 0)] : [];
  lessons.push(...await pool(flat.slice(1), concurrency, (x, k) => writeLesson(x, k + 1)));
  write(path.join(dir, 'work', 'lessons.json'), lessons);

  const lessonSummary = (i: number) => flat.map((x, k) => ({ x, d: lessons[k] })).filter(({ x }) => x.i === i)
    .map(({ x, d }) => `- ${x.l.title}: ${x.l.key_points.join('; ')}. Takeaways: ${d.recap.join(' ')}`).join('\n');

  log('Writing checkpoints…');
  const checkpoints = await pool(outline.modules, concurrency, async (m, i) => {
    const c = await model.call({
      role: 'writer', label: `checkpoint ${i + 1}`, system: P.CHECKPOINT_SYSTEM, cached: ctx, schema: CheckpointDraft,
      prompt: P.CHECKPOINT_TASK({ module: m.title, objectives: m.objectives, lessons: lessonSummary(i) }), check: checkCheckpoint,
    });
    log(`  ✓ checkpoint ${i + 1}`);
    return c;
  });

  log('Writing final-exam questions…');
  const exam = await pool(outline.modules, concurrency, async (m, i) => {
    const e = await model.call({
      role: 'examiner', label: `exam ${i + 1}`, system: P.EXAMINER_SYSTEM, cached: ctx, schema: ExamDraft,
      prompt: P.EXAMINER_TASK({ module: m.title, objectives: m.objectives, lessons: lessonSummary(i), count: brief.exam.pool_per_module,
        avoid: [...checkpoints[i].quiz.map(q => q.text), ...flat.filter(x => x.i === i).flatMap(x => lessons[flat.indexOf(x)].exercises.map(e => e.prompt))].map(s => s.replace(/<[^>]+>/g, '').slice(0, 160)) }),
      check: d => checkExam(d, brief.exam.pool_per_module),
    });
    log(`  ✓ exam questions module ${i + 1}`);
    return e;
  });

  const { course, cleaned } = assemble(brief, outline, ids, lessons, checkpoints);
  const entry = indexEntry(brief, outline);
  const pool_ = examPool(brief, outline, ids, exam);
  write(path.join(dir, 'out', 'course.json'), course);
  write(path.join(dir, 'out', 'index-entry.json'), entry);
  write(path.join(dir, 'out', 'exam-pool.json'), pool_);
  write(path.join(dir, 'out', 'exam-seed.sql'), examSeedSql(brief, outline.title, pool_));
  recordCost(dir, 'build', model, from);
  const report = buildReport({ brief, outline, pack, lessons, flat, cleaned, model, from, dir });
  write(path.join(dir, 'out', 'report.md'), report);
  log(`Done. ${flat.length} lessons, ${outline.modules.length} checkpoints, ${pool_.length} exam questions. Cost ${money(totalCost(model.log.slice(from)))}.`);
  log(`Read ${path.join(dir, 'out', 'report.md')}, then run install.`);
  return { course, entry, exam: pool_, report };
}

function assemble(brief: Brief, o: Outline, ids: Ids[], lessons: LessonDraft[], checkpoints: CheckpointDraft[]) {
  let cleaned = 0;
  const h = (html: string) => { const c = clean(html); if (c.removed) cleaned++; return c.html; };
  let k = 0;
  const modules = o.modules.map((m, i) => ({
    id: ids[i].modId, num: String(i + 1), title: m.title, kind: 'core', setup: '',
    hours: Math.round(m.lessons.reduce((a, l) => a + l.minutes, 0) / 6) / 10,
    summary: m.summary, objectives: m.objectives,
    lessons: m.lessons.map((l, j) => {
      const d = lessons[k++], lid = ids[i].lessonIds[j];
      return {
        id: lid, num: `${i + 1}.${j + 1}`, title: l.title, minutes: l.minutes, goal: l.goal,
        explain: h(d.explain),
        examples: d.examples.map(e => ({ note: h(e.note) })),
        mistakes: d.mistakes.map(x => ({ text: h(x.text) })),
        exercises: d.exercises.map((e, n) => ({ id: `${lid}-e${n + 1}`, prompt: h(e.prompt), check: 'manual', solution: h(e.solution), hint: e.hint, level: e.level })),
        recap: d.recap, docs: [], sources: d.sources_used,
      };
    }),
    checkpoint: {
      intro: h(checkpoints[i].intro),
      quiz: checkpoints[i].quiz.map((q, n) => ({ id: `${ids[i].modId}-q${n + 1}`, type: 'mc', text: h(q.text), options: q.options.map(x => ({ text: h(x.text), correct: x.correct })), explain: h(q.explain) })),
      practical: { id: `${ids[i].modId}-p1`, prompt: h(checkpoints[i].practical.prompt), check: 'manual', solution: h(checkpoints[i].practical.solution), minutes: checkpoints[i].practical.minutes },
    },
  }));
  return { course: { built: new Date().toISOString(), engine: 'none', generator: 'coursify course builder', language: brief.language, setups: {}, files: {}, kit: {}, modules }, cleaned };
}

function indexEntry(brief: Brief, o: Outline) {
  return {
    id: brief.id, kind: 'general', title: o.title, eyebrow: o.eyebrow, brand: `${o.eyebrow} · ${o.short_title}`, shortTitle: o.short_title,
    summary: o.summary, lead: o.lead, pace: o.pace, outcomes: o.outcomes, modules: o.modules.length,
  };
}

export interface PoolQuestion { id: string; topic: string; topic_title: string; position: number; kind: 'single' | 'multi'; prompt: string; options: string[]; correct: number | number[]; explain: string }

/** Shuffles options with a seed from the question id, so the right answer isn't always in the same place. */
function shuffle<T>(items: T[], seed: string): number[] {
  let s = parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

function examPool(brief: Brief, o: Outline, ids: Ids[], exam: ExamDraft[]): PoolQuestion[] {
  return exam.flatMap((e, i) => e.questions.map((q, n) => {
    const id = `${brief.id}:${ids[i].modId}-${String.fromCharCode(97 + n)}`;
    const order = shuffle(q.options, id);
    const map = Object.fromEntries(order.map((old, neu) => [old, neu]));
    const correct = [...new Set(q.correct)].map(c => map[c]).sort((a, b) => a - b);
    return {
      id, topic: ids[i].modId, topic_title: `Module ${i + 1} · ${o.modules[i].title}`, position: i * 10 + n, kind: q.kind,
      prompt: clean(q.prompt).html, options: order.map(old => clean(q.options[old]).html), correct: q.kind === 'single' ? correct[0] : correct, explain: q.explain,
    };
  }));
}

const lit = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;
export function examSeedSql(brief: Brief, title: string, pool_: PoolQuestion[]): string {
  const e = brief.exam;
  return `-- Final exam for "${title}". Run in the Supabase SQL editor of the Coursify project.
-- Contains the answers: keep this file out of the public repository.
insert into public.coursify_exams (course_id, title, questions_per_topic, pass_percent, time_limit_minutes, cooldown_hours)
values (${lit(brief.id)}, ${lit(title)}, ${e.questions_per_module}, ${e.pass_percent}, ${e.time_limit_minutes}, ${e.cooldown_hours})
on conflict (course_id) do update set title = excluded.title, questions_per_topic = excluded.questions_per_topic,
  pass_percent = excluded.pass_percent, time_limit_minutes = excluded.time_limit_minutes, cooldown_hours = excluded.cooldown_hours;
delete from public.coursify_exam_questions where course_id = ${lit(brief.id)};
insert into public.coursify_exam_questions (id, course_id, topic, topic_title, position, kind, prompt, options, correct, explain) values
${pool_.map(q => `(${lit(q.id)}, ${lit(brief.id)}, ${lit(q.topic)}, ${lit(q.topic_title)}, ${q.position}, ${lit(q.kind)}, ${lit(q.prompt)}, ${lit(JSON.stringify(q.options))}::jsonb, ${lit(JSON.stringify(q.correct))}::jsonb, ${lit(q.explain)})`).join(',\n')};
`;
}

function buildReport(a: { brief: Brief; outline: Outline; pack: SourcePack; lessons: LessonDraft[]; flat: { i: number; j: number; l: { title: string } }[]; cleaned: number; model: Model; from: number; dir: string }) {
  const used = new Set(a.lessons.flatMap(l => l.sources_used));
  const byDoc = a.pack.docs.map(d => {
    const ps = a.pack.passages.filter(p => p.doc === d.file);
    return `| ${d.file} | ${ps.length} | ${ps.filter(p => used.has(p.id)).length} |`;
  });
  const calls = a.model.log.slice(a.from);
  const byRole = ['extract', 'architect', 'writer', 'examiner'].map(r => {
    const c = calls.filter(x => x.role === r);
    return c.length ? `| ${r} | ${c[0].model} | ${c.length} | ${c.filter(x => x.repaired).length} | ${money(totalCost(c))} |` : null;
  }).filter(Boolean);
  const unused = a.pack.passages.filter(p => !used.has(p.id));
  return [
    `# Build report: ${a.outline.title}`, '', `Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from ${a.pack.docs.length} document(s).`, '',
    '## What was made', `- ${a.outline.modules.length} modules, ${a.flat.length} lessons, ${a.outline.modules.length} checkpoints`,
    `- ${a.outline.modules.length * a.brief.exam.pool_per_module} exam questions (${a.brief.exam.questions_per_module} per module drawn per attempt)`,
    `- HTML with something unsafe removed: ${a.cleaned} field(s)`, '',
    '## Use of your material', '| Document | Passages | Used in lessons |', '| --- | ---: | ---: |', ...byDoc, '',
    `${used.size} of ${a.pack.passages.length} passages are used in at least one lesson.`,
    ...(unused.length ? ['', 'Not used (check whether something important is missing):', ...unused.slice(0, 30).map(p => `- ${p.id} · ${p.heading || '(no heading)'}: ${p.text.slice(0, 90).replace(/\s+/g, ' ')}…`)] : []),
    ...(a.outline.gaps.length ? ['', '## Gaps the architect flagged', ...a.outline.gaps.map(g => `- ${g}`)] : []), '',
    '## Cost of this build', '| Step | Model | Calls | Repaired | Cost |', '| --- | --- | ---: | ---: | ---: |', ...byRole, '',
    `Total: ${money(totalCost(calls))} (list prices; see work/costs.json for every run).`, '',
    '## Before you publish', '- Read a few lessons and the checkpoints in the preview.',
    '- Not checked automatically yet: whether every claim matches your material, and whether quiz questions are fair. Read them.',
    '- The exam answers are in out/exam-seed.sql and out/exam-pool.json. Never commit them.',
  ].join('\n');
}

// ------------------------------------------------------------------ install

export function install(dir: string, repo: string, log: Log) {
  const brief = loadBrief(dir);
  const out = path.join(dir, 'out');
  for (const f of ['course.json', 'index-entry.json']) if (!fs.existsSync(path.join(out, f))) throw new Error(`Missing ${path.join(out, f)}: run build first.`);
  const target = path.join(repo, 'public', 'courses', brief.id);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(out, 'course.json'), path.join(target, 'course.json'));
  write(path.join(target, 'dataset.json'), { sql: '' });
  const indexFile = path.join(repo, 'public', 'courses', 'index.json');
  const index = read<{ courses: { id: string }[] }>(indexFile);
  const entry = read<{ id: string }>(path.join(out, 'index-entry.json'));
  const at = index.courses.findIndex(c => c.id === entry.id);
  if (at >= 0) index.courses[at] = entry; else index.courses.push(entry);
  write(indexFile, index);
  log(`Installed in ${target} and added to public/courses/index.json.`);
  log(`Next: run ${path.join(out, 'exam-seed.sql')} in the Supabase SQL editor (it holds the exam answers; don't commit it), then deploy.`);
}

// ------------------------------------------------------------------ new

export function scaffold(root: string, id: string, log: Log) {
  const dir = path.join(root, id);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists.`);
  fs.mkdirSync(path.join(dir, 'sources'), { recursive: true });
  write(path.join(dir, 'brief.yaml'), `# The brief for this course. Only id, title and audience are required.
id: ${id}
title: ${id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}
audience: Who takes this course and what they already know
level: beginner            # beginner | intermediate | advanced
language: en               # en | nl
modules: 6
lessons_per_module: 3
minutes_per_lesson: 20
context: Where examples come from, e.g. "our insurance brokerage"
notes: Anything the course must do or avoid
exam:
  questions_per_module: 2  # drawn per attempt
  pool_per_module: 4       # written per module
  pass_percent: 75
  time_limit_minutes: 45
  cooldown_hours: 24
`);
  log(`Created ${dir}. Edit brief.yaml, put your documents in ${path.join(dir, 'sources')}/, then run plan.`);
}
