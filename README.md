# Coursify

A course platform with learner accounts. The first course is the Harbourline SQL Course: SQL runs in the
browser via PGlite against synthetic insurance data. Learners sign in with email and password (Supabase);
their progress is saved to their account per course, so it follows them to every device.

## Commands (npm, Node 20+)

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (lockfile: `package-lock.json`) |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm test` | Unit tests (Vitest), including the real engine in Node (~15 s) |
| `npm run test:grading-engine` | Every model answer through the TypeScript engine in Node (~80 s, no browser needed) |
| `npm run test:grading` | Every model answer through the checker on the real page in Chromium (~5 min) |
| `npm run test:ui` | Browser checks: sign-in, catalogue, account sync, saved progress, exercise flow, reset, keyboard, reduced motion, mobile drawer, blocks, failure states (~2 min) |

The browser checks need `npm run build && npm run preview` running and, once, `npx playwright install chromium`
(or set `CHROMIUM_PATH` to an installed Chromium). They answer every Supabase request with a fake, signed-in
test learner (`tests/fake-supabase.mjs`), so they never touch real accounts.
They write logs and screenshots to `test-results/` (not committed).

## Deploy (Netlify)

`netlify.toml` sets the build: `npm run build`, publish `dist/`, Node 22. Connect the GitHub repo in Netlify;
the engine assets in `public/pglite/` and `public/courses/sql/` are copied into `dist/` by Vite.

## Adding a course with the course builder

The builder turns your documents into a course in the site's format, with checkpoints and final-exam questions.
Everything about one course lives in `course-src/<id>/`, which is **never committed** (your documents and the exam
answers stay private; this repository is public).

```bash
npm run course -- new risk-basics       # creates course-src/risk-basics/ with brief.yaml and sources/
# edit brief.yaml, put your PDF, Word, Markdown or text files in course-src/risk-basics/sources/
npm run course -- plan risk-basics      # reads the material and designs the outline (Claude Opus 5.5)
# read work/outline.md; change work/outline.json if you want (titles, order, what each lesson covers)
npm run course -- build risk-basics     # writes lessons, checkpoints and exam questions (Claude Sonnet 5.5)
# read out/report.md: use of your material, gaps, problems repaired, cost
npm run course -- install risk-basics   # copies the course into public/courses/ and the course list
```

Then run `course-src/<id>/out/exam-seed.sql` in the Supabase SQL editor (it loads the exam), and deploy.

- Needs an Anthropic API key in `ANTHROPIC_API_KEY`. A course of ~300 pages costs roughly $10–15 to build.
- Steps: read sources (PDFs via Claude Haiku 5.5) → outline (Opus 5.5) → lessons in parallel, then checkpoints and
  exam questions (Sonnet 5.5). Your material is sent once and cached, so 40 lessons don't each pay to read it.
- Checks without a model: counts and shapes, exactly one right answer per quiz question, only cited sources that
  exist, HTML cleaned to a short allow-list. A step that fails a check gets one repair attempt, then stops with
  the problems listed. Finished steps are saved; run the command again to continue.
- Not checked automatically yet: whether every claim matches the material, and whether questions are fair.
  Read the lessons in the preview before you publish.
- Models per step can be changed with `COURSE_MODEL_ARCHITECT`, `COURSE_MODEL_WRITER`, `COURSE_MODEL_EXAMINER`,
  `COURSE_MODEL_EXTRACT`. Code: `builder/` (tests run the whole pipeline with a stand-in model: `npm test`).

Built courses are "general" courses (`kind: "general"` in the course list): reading, worked examples, written
exercises the learner compares with a model answer, checkpoint quizzes, and the final exam. They have no database.

### Adding a course by hand

1. Create `public/courses/<id>/` with `course.json` (same shape as `public/courses/sql/course.json`, see
   `src/lib/types.ts`) and, for SQL courses, `dataset.json` (`{"sql": "..."}`).
2. Add an entry to `public/courses/index.json`: `id`, `kind` (`sql` or `general`), `title`, `eyebrow`, `brand`,
   `shortTitle`, `summary`, `lead`, `outcomes`, optional `pace` and `modules` (the module count).
3. Deploy. The course appears in the catalogue at `/`, opens at `/?course=<id>`, and gets its own saved progress.

Course files in `public/` can be downloaded by anyone who knows the address; only the exam answers are protected.

## Accounts and progress

- Supabase project "Dashboard" (`nbeejssppyaikhveogip`), table `public.coursify_progress`: one row per learner
  per course, readable and writable only by that learner (row level security). Schema in `supabase/migrations/`.
- `src/lib/supabase.ts` has the project URL and publishable key built in (both public by design; access is enforced by row level security). Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` to point a build at another project.
- `src/lib/sync.ts`: every change is kept in the browser at once and sent to the account a second later; failed
  sends are retried and shown in a banner. Progress saved before accounts existed (localStorage key
  `harbourline-sql-course-v1`) is imported into the account on first sign-in.
- Supabase Auth settings: confirmation and password-reset links return to the page they were requested from, so
  the site's address must be listed under Authentication → URL Configuration → Redirect URLs.

## Final exam and certificate

- Each course can have a final exam (`coursify_exams` in Supabase). It opens when every core module's
  checkpoint is passed, draws `questions_per_topic` new questions from every module, has a time limit, a pass
  mark and a waiting time before a retake (SQL course: 30 questions, 60 minutes, 75%, 24 hours).
- Questions and answers live only in `coursify_exam_questions`, which no learner can read. Starting, autosaving
  and grading are SQL functions (`coursify_exam_start`, `_save`, `_submit`), so answers never reach the browser
  and a score can't be changed. Answers sent after the time limit are ignored.
- SQL questions of kind `value` ask the learner to query the practice database and enter the result.
- A pass issues a certificate (`coursify_certificates`) with a code; anyone can check it at `/?verify=<code>`
  without an account. The certificate page prints on one A4 page.
- The question pool is **not** in this repository, because the repository is public. Edit it in the Supabase
  table editor, or keep the source file somewhere private.

## Layout

- `src/` – React app
  - `src/App.tsx` – shell: sidebar, top bar, hash routes; `src/pages/` – home, module, lesson, checkpoint
  - `src/components/Work.tsx` – examples, mistakes, exercises; `src/kit/blocks.tsx` – interactive teaching blocks
  - `src/styles/` – AI Academy tokens and fonts (`tokens/`, `academy.css`) plus course styles (`app.css`)
  - `src/lib/engine.ts` – practice database: lesson state, rollback runs, grading
  - `src/lib/compare.ts` – result comparison rules; `src/lib/progress.ts` – progress format and validation
  - `src/lib/sync.ts` – progress per account and course; `src/lib/supabase.ts` – Supabase client
  - `src/pages/Auth.tsx`, `src/pages/Catalog.tsx` – sign-in and course list; `src/state/auth.tsx` – session
  - `src/pages/Exam.tsx`, `src/pages/Certificate.tsx`, `src/pages/Verify.tsx` – final exam, certificate, public check; `src/lib/exam.ts` – exam calls
- `public/legacy.html` – the original single-file course, kept for comparison during the migration
- `public/courses/sql/` – course content (`course.json`) and dataset (`dataset.json`)
- `public/pglite/` – bundled database engine; `public/jsrunner.js` – local Supabase-style adapter for the JavaScript exercises
- `tests/` – browser checks
