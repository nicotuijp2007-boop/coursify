// Shapes of public/data/course.json as the course uses them. Lesson text fields are trusted HTML
// authored in the course build, so they are rendered as HTML, not escaped.

export type CheckMode = 'unordered' | 'ordered' | 'rowcount' | 'manual' | 'js';

/** A result table as stored in course.json (`output`, `expected`) and as produced by the engine. */
export interface ResultTable {
  cols: string[];
  rows: unknown[][];
  affected?: number;
  /** Total rows when `rows` is a truncated preview. */
  rowCount?: number;
}

export interface Example {
  note: string;
  sql?: string;
  js?: string;
  output?: ResultTable;
  error?: string;
  logs?: string[];
  jsError?: string;
  /** Runs inside a rollback: does not change the lesson state. */
  temp?: boolean;
  expectError?: boolean;
  /** Meant for the learner's own computer, not the in-page database. */
  manual?: boolean;
}

export interface Mistake {
  text: string;
  sql?: string;
  error?: string;
  output?: ResultTable;
  silent?: boolean;
}

export interface Exercise {
  id: string;
  prompt: string;
  check: CheckMode;
  level?: string;
  hint?: string;
  solution?: string;
  starter?: string;
  /** Query run after the learner's statement; its result is what gets compared. */
  verify?: string;
  /** Model answer result, possibly a preview. Grading reruns `solution` instead. */
  expected?: ResultTable;
  jsSolution?: string;
  jsStarter?: string;
  expectedLogs?: string[];
}

export interface Practical extends Omit<Exercise, 'prompt' | 'level' | 'hint'> {
  prompt: string;
  minutes: number;
}

export interface QuizOption { text: string; correct?: boolean }

export interface QuizItem {
  id: string;
  type: 'mc' | 'predict' | 'write';
  text: string;
  options?: QuizOption[];
  explain?: string;
  answer?: string;
  predictSql?: string;
  predictOutput?: ResultTable;
  predictError?: string;
  solution?: string;
  check?: CheckMode;
  expected?: ResultTable;
}

export interface Checkpoint {
  intro?: string;
  quiz: QuizItem[];
  practical?: Practical;
}

export interface Lesson {
  id: string;
  num: string;
  title: string;
  minutes: number;
  goal: string;
  explain: string;
  explainSql?: string;
  examples: Example[];
  mistakes: Mistake[];
  exercises: Exercise[];
  project?: string;
  recap: string[];
  docs: { label: string; url: string }[];
}

export interface Module {
  id: string;
  num: string;
  title: string;
  kind: string;
  hours: number;
  prereq?: unknown;
  /** Setup steps joined by '+': 'dataset' or a key of Course.setups. */
  setup: string;
  summary: string;
  objectives: string[];
  intro?: string;
  lessons: Lesson[];
  checkpoint?: Checkpoint;
}

export interface Course {
  built: string;
  engine: string;
  setups: Record<string, string>;
  /** Downloadable student-app teaching files. Not platform configuration. */
  files: Record<string, string>;
  kit: Record<string, { type: string; id: string; [k: string]: unknown }>;
  modules: Module[];
}
