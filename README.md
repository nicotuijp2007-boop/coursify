# Harbourline SQL Course

A PostgreSQL learning platform. SQL runs in the browser via PGlite against synthetic insurance data.

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
| `npm run test:ui` | Browser checks: saved progress, exercise flow, reset, keyboard, reduced motion, mobile drawer, blocks, failure states (~2 min) |

The browser checks need `npm run build && npm run preview` running and, once, `npx playwright install chromium`.
They write logs and screenshots to `test-results/` (not committed).

## Deploy (Netlify)

`netlify.toml` sets the build: `npm run build`, publish `dist/`, Node 22. Connect the GitHub repo in Netlify;
the engine assets in `public/pglite/` and `public/data/` are copied into `dist/` by Vite.

## Layout

- `src/` – React app
  - `src/App.tsx` – shell: sidebar, top bar, hash routes; `src/pages/` – home, module, lesson, checkpoint
  - `src/components/Work.tsx` – examples, mistakes, exercises; `src/kit/blocks.tsx` – interactive teaching blocks
  - `src/styles/` – AI Academy tokens and fonts (`tokens/`, `academy.css`) plus course styles (`app.css`)
  - `src/lib/engine.ts` – practice database: lesson state, rollback runs, grading
  - `src/lib/compare.ts` – result comparison rules; `src/lib/progress.ts` – saved progress (localStorage)
- `public/legacy.html` – the original single-file course, kept for comparison during the migration
- `public/data/` – course content (`course.json`) and dataset (`dataset.json`)
- `public/pglite/` – bundled database engine; `public/jsrunner.js` – local Supabase-style adapter for the JavaScript exercises
- `tests/` – browser checks
