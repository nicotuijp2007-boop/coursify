// Shapes of what each model step must return (sent to the API as structured output, then checked again here),
// and of the brief you write. Keep these simple: structured outputs accept plain objects, arrays, strings,
// numbers, booleans and enums. Counts and cross-checks are done in checks.ts.
import { z } from 'zod';

export const Brief = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'id: lowercase letters, digits and dashes'),
  title: z.string().min(3),
  audience: z.string().min(3),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  language: z.enum(['en', 'nl']).default('en'),
  modules: z.number().int().min(1).max(20).default(6),
  lessons_per_module: z.number().int().min(1).max(8).default(3),
  minutes_per_lesson: z.number().int().min(5).max(60).default(20),
  /** Where examples come from: "our insurance brokerage", "a Dutch municipality"… */
  context: z.string().default(''),
  /** Anything else the course must do or avoid. */
  notes: z.string().default(''),
  exam: z.object({
    questions_per_module: z.number().int().min(1).max(5).default(2),
    pool_per_module: z.number().int().min(2).max(8).default(4),
    pass_percent: z.number().int().min(50).max(100).default(75),
    time_limit_minutes: z.number().int().min(10).max(240).default(45),
    cooldown_hours: z.number().int().min(0).max(720).default(24),
  }).default({ questions_per_module: 2, pool_per_module: 4, pass_percent: 75, time_limit_minutes: 45, cooldown_hours: 24 }),
});
export type Brief = z.infer<typeof Brief>;

export const Passages = z.object({
  passages: z.array(z.object({ heading: z.string(), text: z.string() })),
});

export const Outline = z.object({
  title: z.string(),
  eyebrow: z.string().describe('Short label above the title, e.g. the organisation or subject area'),
  short_title: z.string().describe('2-4 words, for browser tabs'),
  summary: z.string().describe('One or two sentences for the course card'),
  lead: z.string().describe('Intro paragraph on the course home page'),
  pace: z.string().describe('e.g. "About 2 hours a week"'),
  outcomes: z.array(z.string()).describe('What the learner can do afterwards; each starts lowercase and ends with ";" except the last with "."'),
  modules: z.array(z.object({
    title: z.string(),
    summary: z.string(),
    objectives: z.array(z.string()).describe('Testable: "explain…", "decide…", "spot…"'),
    lessons: z.array(z.object({
      title: z.string(),
      goal: z.string().describe('Starts with "Afterwards you can…"'),
      minutes: z.number(),
      key_points: z.array(z.string()),
      source_ids: z.array(z.string()).describe('Ids of the passages this lesson is built on'),
    })),
  })),
  gaps: z.array(z.string()).describe('Topics the brief asks for that the material barely covers'),
});
export type Outline = z.infer<typeof Outline>;

export const LessonDraft = z.object({
  explain: z.string().describe('HTML: the explanation'),
  examples: z.array(z.object({ note: z.string().describe('HTML: one worked example, a realistic case worked through step by step') })),
  mistakes: z.array(z.object({ text: z.string().describe('HTML: a common misconception or mistake, why it is wrong, and what to do instead') })),
  exercises: z.array(z.object({
    prompt: z.string().describe('HTML: the task'),
    solution: z.string().describe('HTML: a model answer with the points a good answer must contain'),
    hint: z.string(),
    level: z.enum(['basic', 'stretch']),
  })),
  recap: z.array(z.string()),
  sources_used: z.array(z.string()),
});
export type LessonDraft = z.infer<typeof LessonDraft>;

export const CheckpointDraft = z.object({
  intro: z.string().describe('HTML: one short paragraph'),
  quiz: z.array(z.object({
    text: z.string().describe('HTML: the question'),
    options: z.array(z.object({ text: z.string(), correct: z.boolean() })),
    explain: z.string().describe('HTML: why the right answer is right and the others are wrong'),
  })),
  practical: z.object({
    prompt: z.string().describe('HTML: a realistic task that applies the whole module'),
    solution: z.string().describe('HTML: a model answer'),
    minutes: z.number(),
  }),
});
export type CheckpointDraft = z.infer<typeof CheckpointDraft>;

export const ExamDraft = z.object({
  questions: z.array(z.object({
    kind: z.enum(['single', 'multi']),
    prompt: z.string().describe('HTML'),
    options: z.array(z.string()).describe('HTML each'),
    correct: z.array(z.number()).describe('0-based indexes of the correct options'),
    explain: z.string(),
  })),
});
export type ExamDraft = z.infer<typeof ExamDraft>;
