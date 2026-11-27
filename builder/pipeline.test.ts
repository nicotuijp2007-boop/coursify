// Runs the whole builder on the sample course with the fake model: plan → build → install into a scratch repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, install, loadBrief, plan, scaffold } from './pipeline';
import { fakeModel } from './fake';
import { checkCheckpoint, checkExam, clean } from './checks';
import { splitText } from './sources';

const FIXTURE = path.join(__dirname, 'fixtures', 'complaints');

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coursify-builder-'));
  const dir = path.join(root, 'handling-complaints');
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'public', 'courses'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'public', 'courses', 'index.json'), JSON.stringify({ courses: [{ id: 'sql', title: 'SQL' }] }));
  return { root, dir, repo };
}

describe('course builder', () => {
  it('builds and installs a complete general course', async () => {
    const { dir, repo } = scratch();
    const model = fakeModel({ flawFirstLesson: true, unsafeHtml: true });
    const logs: string[] = [];
    const outline = await plan(dir, model, s => logs.push(s));
    expect(outline.modules).toHaveLength(2);
    expect(fs.existsSync(path.join(dir, 'work', 'outline.md'))).toBe(true);

    const { course, exam, report } = await build(dir, model, s => logs.push(s), { concurrency: 3 });
    // Shape the app expects.
    expect(course.modules.map(m => m.id)).toEqual(['m01', 'm02']);
    const lessons = course.modules.flatMap(m => m.lessons);
    expect(lessons.map(l => l.id)).toEqual(['m01-l1', 'm01-l2', 'm02-l1', 'm02-l2']);
    expect(lessons.every(l => l.exercises.length >= 2 && l.exercises.every(e => e.check === 'manual'))).toBe(true);
    expect(new Set(lessons.flatMap(l => l.exercises.map(e => e.id))).size).toBe(lessons.reduce((a, l) => a + l.exercises.length, 0));
    expect(course.modules.every(m => m.checkpoint.quiz.every(q => q.options.filter(o => o.correct).length === 1))).toBe(true);
    // The flawed first lesson was repaired, and unsafe HTML removed.
    expect(model.log.some(c => c.label === 'lesson 1.1' && c.repaired)).toBe(true);
    expect(lessons[0].explain).not.toMatch(/script|onclick/);
    expect(report).toMatch(/something unsafe removed: 1 field/);
    // Exam pool: 3 per module, options shuffled but answers still pointing at the right text.
    expect(exam).toHaveLength(6);
    for (const q of exam) {
      if (q.kind === 'single') expect(q.options[q.correct as number]).toBe('B');
      else expect((q.correct as number[]).map(i => q.options[i]).sort()).toEqual(['A', 'C']);
    }
    const seed = fs.readFileSync(path.join(dir, 'out', 'exam-seed.sql'), 'utf8');
    expect(seed).toContain("'handling-complaints:m01-a'");
    expect(seed).toMatch(/questions_per_topic, pass_percent/);

    install(dir, repo, s => logs.push(s));
    const index = JSON.parse(fs.readFileSync(path.join(repo, 'public', 'courses', 'index.json'), 'utf8'));
    expect(index.courses.map((c: { id: string }) => c.id)).toEqual(['sql', 'handling-complaints']);
    expect(index.courses[1]).toMatchObject({ kind: 'general', modules: 2 });
    const installed = fs.readdirSync(path.join(repo, 'public', 'courses', 'handling-complaints')).sort();
    expect(installed).toEqual(['course.json', 'dataset.json']); // never the exam answers or your documents
    // Installing twice replaces the entry instead of adding a second one.
    install(dir, repo, () => {});
    expect(JSON.parse(fs.readFileSync(path.join(repo, 'public', 'courses', 'index.json'), 'utf8')).courses).toHaveLength(2);
  });

  it('refuses to build from an outline with unknown sources', async () => {
    const { dir } = scratch();
    const model = fakeModel();
    await plan(dir, model, () => {});
    const f = path.join(dir, 'work', 'outline.json');
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    o.modules[0].lessons[0].source_ids = ['made-up:1'];
    fs.writeFileSync(f, JSON.stringify(o));
    await expect(build(dir, model, () => {})).rejects.toThrow(/unknown source ids: made-up:1/);
  });

  it('starts a new course folder with a valid brief', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coursify-new-'));
    scaffold(root, 'risk-basics', () => {});
    expect(loadBrief(path.join(root, 'risk-basics'))).toMatchObject({ id: 'risk-basics', language: 'en', modules: 6 });
    expect(fs.existsSync(path.join(root, 'risk-basics', 'sources'))).toBe(true);
  });

  it('explains a broken brief', () => {
    const { dir } = scratch();
    fs.writeFileSync(path.join(dir, 'brief.yaml'), 'id: Not Valid\ntitle: x\n');
    expect(() => loadBrief(dir)).toThrow(/id: lowercase letters/);
  });
});

describe('checks', () => {
  it('cleans HTML to the allow-list', () => {
    expect(clean('<p>Hi <a href="javascript:x">x</a><img src=x onerror=y></p>')).toEqual({ html: '<p>Hi <a rel="noopener noreferrer" target="_blank">x</a></p>', removed: true });
    expect(clean('<p><strong>ok</strong></p>').removed).toBe(false);
  });
  it('catches quiz and exam questions without exactly the right number of answers', () => {
    const q = (correct: boolean[]) => ({ text: 'q', options: correct.map((c, i) => ({ text: 'o' + i, correct: c })), explain: '' });
    expect(checkCheckpoint({ intro: '', quiz: [q([true, true, false]), q([true, false, false]), q([true, false, false]), q([true, false, false])], practical: { prompt: '', solution: 'x'.repeat(100), minutes: 10 } }))
      .toEqual(['Quiz question 1 must have exactly one correct option; it has 2.']);
    expect(checkExam({ questions: [{ kind: 'multi', prompt: '', options: ['a', 'b', 'c'], correct: [0], explain: '' }] }, 1))
      .toEqual(['Question 1 is "multi": it needs at least 2 correct options and at least 1 wrong one.']);
  });
  it('splits text into passages under their headings', () => {
    const parts = splitText('# Title\n\nIntro.\n\n## Part\n\nOne.\n\nTwo.');
    expect(parts).toEqual([{ heading: 'Title', text: 'Intro.' }, { heading: 'Part', text: 'One.\n\nTwo.' }]);
  });
});
