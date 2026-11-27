// Checks that need no model: shape and counts, one right answer per quiz question, cited sources that exist,
// and HTML cleaned to a short allow-list (the site shows lesson text as trusted HTML).
import sanitizeHtml from 'sanitize-html';
import type { CheckpointDraft, ExamDraft, LessonDraft, Outline } from './schemas';

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'code', 'pre', 'blockquote', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'span', 'div', 'kbd', 'mark', 'sup', 'sub', 'dl', 'dt', 'dd'],
  allowedAttributes: { a: ['href', 'title'], th: ['scope'], td: ['colspan', 'rowspan'], span: ['class'], div: ['class'] },
  allowedSchemes: ['https', 'mailto'],
  allowedClasses: { span: ['hint', 'muted'], div: ['callout', 'note'] },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
};

export interface Cleaned { html: string; removed: boolean }

const RISKY = /<(script|style|iframe|object|embed|img|svg|form|input|button|link|meta)\b|\son\w+\s*=|javascript:|data:/i;

/** Cleans generated HTML to the allow-list. `removed` flags HTML that had something unsafe in it. */
export function clean(html: string): Cleaned {
  const out = sanitizeHtml(html, { ...ALLOWED, allowedAttributes: { ...ALLOWED.allowedAttributes, a: ['href', 'title', 'rel', 'target'] } }).trim();
  return { html: out, removed: RISKY.test(html) };
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function checkOutline(o: Outline, sourceIds: Set<string>, want: { modules: number; lessons: number }): string[] {
  const p: string[] = [];
  if (o.modules.length < Math.max(1, want.modules - 2) || o.modules.length > want.modules + 2) p.push(`Make ${want.modules} modules (±2); you made ${o.modules.length}.`);
  if (o.outcomes.length < 3) p.push('List at least 3 outcomes.');
  o.modules.forEach((m, i) => {
    if (m.objectives.length < 2) p.push(`Module ${i + 1} needs at least 2 objectives.`);
    if (!m.lessons.length) p.push(`Module ${i + 1} has no lessons.`);
    m.lessons.forEach((l, j) => {
      if (!l.source_ids.length) p.push(`Lesson ${i + 1}.${j + 1} "${l.title}" cites no sources.`);
      const bad = l.source_ids.filter(s => !sourceIds.has(s));
      if (bad.length) p.push(`Lesson ${i + 1}.${j + 1} cites unknown source ids: ${bad.slice(0, 5).join(', ')}.`);
      if (l.key_points.length < 2) p.push(`Lesson ${i + 1}.${j + 1} needs at least 2 key points.`);
    });
  });
  return p;
}

export function checkLesson(l: LessonDraft, allowed: Set<string>): string[] {
  const p: string[] = [];
  if (text(l.explain).length < 600) p.push('The explanation is too short: write at least 600 characters of explanation.');
  if (!l.examples.length) p.push('Add at least one worked example.');
  if (!l.mistakes.length) p.push('Add at least one common mistake.');
  if (l.exercises.length < 2) p.push('Add at least 2 exercises.');
  l.exercises.forEach((e, i) => { if (text(e.solution).length < 40) p.push(`Exercise ${i + 1} needs a real model answer.`); });
  if (l.recap.length < 2 || l.recap.length > 5) p.push('Give 2 to 5 recap points.');
  if (!l.sources_used.length) p.push('List the source ids you used in sources_used.');
  const bad = l.sources_used.filter(s => !allowed.has(s));
  if (bad.length) p.push(`sources_used may only contain the ids given for this lesson; remove: ${bad.slice(0, 5).join(', ')}.`);
  return p;
}

export function checkCheckpoint(c: CheckpointDraft): string[] {
  const p: string[] = [];
  if (c.quiz.length < 4 || c.quiz.length > 8) p.push(`Write 4 to 8 quiz questions; you wrote ${c.quiz.length}.`);
  c.quiz.forEach((q, i) => {
    const n = q.options.filter(o => o.correct).length;
    if (n !== 1) p.push(`Quiz question ${i + 1} must have exactly one correct option; it has ${n}.`);
    if (q.options.length < 3 || q.options.length > 5) p.push(`Quiz question ${i + 1} needs 3 to 5 options.`);
    if (new Set(q.options.map(o => text(o.text).toLowerCase())).size !== q.options.length) p.push(`Quiz question ${i + 1} has duplicate options.`);
  });
  if (text(c.practical.solution).length < 80) p.push('The practical needs a real model answer.');
  return p;
}

export function checkExam(e: ExamDraft, want: number): string[] {
  const p: string[] = [];
  if (e.questions.length !== want) p.push(`Write exactly ${want} questions; you wrote ${e.questions.length}.`);
  e.questions.forEach((q, i) => {
    const n = q.options.length, c = [...new Set(q.correct)];
    if (n < 3 || n > 5) p.push(`Question ${i + 1} needs 3 to 5 options.`);
    if (c.some(x => !Number.isInteger(x) || x < 0 || x >= n)) p.push(`Question ${i + 1} has a correct index outside its options.`);
    if (q.kind === 'single' && c.length !== 1) p.push(`Question ${i + 1} is "single" but has ${c.length} correct options.`);
    if (q.kind === 'multi' && (c.length < 2 || c.length >= n)) p.push(`Question ${i + 1} is "multi": it needs at least 2 correct options and at least 1 wrong one.`);
    if (new Set(q.options.map(o => text(o).toLowerCase())).size !== n) p.push(`Question ${i + 1} has duplicate options.`);
  });
  return p;
}
