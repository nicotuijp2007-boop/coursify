// A stand-in for Claude that answers every builder step from the prompt alone, for tests and dry runs.
// It writes placeholder text, but in exactly the shapes and counts the real model must produce.
import { FakeModel, type CallOptions } from './model';

const idsIn = (s: string) => [...s.matchAll(/<source id="([^"]+)"/g)].map(m => m[1]);
const para = (topic: string) => `<p>${topic} matters because it decides what happens next for the client. `
  + 'Work through it in order, write down what you decided and why, and check the result with the client before you close the case. '.repeat(6) + '</p>';

export function fakeModel(opts: { flawFirstLesson?: boolean; unsafeHtml?: boolean } = {}) {
  let flawed = false;
  return new FakeModel((o: CallOptions<unknown>) => {
    const repair = o.prompt.includes('REPAIR:');
    if (o.label === 'outline') {
      const ids = idsIn(o.cached ?? '');
      const n = Number(o.prompt.match(/About (\d+) modules/)?.[1] ?? 2), per = Number(o.prompt.match(/each with (\d+) lessons/)?.[1] ?? 2);
      return {
        title: 'Handling client complaints', eyebrow: 'Client service', short_title: 'Complaints',
        summary: 'Recognise, register and resolve complaints within the deadlines.', lead: 'A practical course on complaints.',
        pace: 'About 1 hour a week', outcomes: ['recognise a complaint;', 'register it correctly;', 'answer it on time.'],
        modules: Array.from({ length: n }, (_, i) => ({
          title: `Module topic ${i + 1}`, summary: `Summary ${i + 1}.`, objectives: [`decide case ${i + 1}a`, `explain case ${i + 1}b`],
          lessons: Array.from({ length: per }, (_, j) => ({
            title: `Lesson ${i + 1}.${j + 1}`, goal: 'Afterwards you can handle it.', minutes: 15, key_points: ['first point', 'second point'],
            source_ids: [ids[(i * per + j) % ids.length]],
          })),
        })),
        gaps: [],
      };
    }
    if (o.label.startsWith('lesson')) {
      const allowed = o.prompt.match(/Build on these passages: (.+)/)?.[1].split(', ').map(s => s.trim()) ?? [];
      const broken = opts.flawFirstLesson && !flawed && !repair;
      if (broken) flawed = true;
      return {
        explain: (opts.unsafeHtml && o.label === 'lesson 1.1' ? '<script>alert(1)</script><p onclick="x()">Click</p>' : '') + `<h3>${o.label}</h3>` + para(o.label),
        examples: [{ note: `<p>Worked example for ${o.label}: a client calls about a late payout.</p>` }],
        mistakes: [{ text: '<p>Treating a question as a complaint, or the other way round.</p>' }],
        exercises: broken ? [] : [
          { prompt: '<p>Is this a complaint? Explain.</p>', solution: '<p>Yes: the client is dissatisfied and expects a response, whatever words they use.</p>', hint: 'Look for dissatisfaction.', level: 'basic' },
          { prompt: '<p>Apply this to a case from your own work.</p>', solution: '<p>A good answer names the case, the step, the deadline and who handles it.</p>', hint: 'Pick a recent case.', level: 'stretch' },
        ],
        recap: ['Register every complaint.', 'Answer within six weeks.'],
        sources_used: allowed.slice(0, 1),
      };
    }
    if (o.label.startsWith('checkpoint')) {
      return {
        intro: '<p>Check what you learned.</p>',
        quiz: Array.from({ length: 5 }, (_, i) => ({
          text: `<p>Checkpoint question ${i + 1}?</p>`,
          options: [{ text: 'Right', correct: true }, { text: 'Wrong A', correct: false }, { text: 'Wrong B', correct: false }],
          explain: '<p>Because.</p>',
        })),
        practical: { prompt: '<p>Handle this complaint from start to finish.</p>', solution: '<p>Register it the same day, confirm within two working days, answer within six weeks, and mention escalation.</p>', minutes: 20 },
      };
    }
    if (o.label.startsWith('exam')) {
      const n = Number(o.prompt.match(/Write (\d+) exam questions/)?.[1] ?? 3);
      return {
        questions: Array.from({ length: n }, (_, i) => i === n - 1
          ? { kind: 'multi', prompt: `<p>${o.label} which apply?</p>`, options: ['A', 'B', 'C', 'D'], correct: [0, 2], explain: 'A and C.' }
          : { kind: 'single', prompt: `<p>${o.label} question ${i + 1}?</p>`, options: ['A', 'B', 'C', 'D'], correct: [1], explain: 'B.' }),
      };
    }
    throw new Error(`fake model: no answer for ${o.label}`);
  });
}
