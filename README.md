# Harbourline SQL Course

A PostgreSQL learning platform. SQL runs in the browser via PGlite against synthetic insurance data.

## Commands (npm, Node 20+)

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (lockfile: `package-lock.json`) |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm test` | Unit tests (Vitest) |
| `npm run test:grading` | Runs every model answer through the checker in Chromium (needs `npm run preview` running and `npx playwright install chromium` once; takes about 5 minutes) |

## Layout

- `src/` – React app (in progress on branch `react-migration`)
- `public/legacy.html` – the original single-file course, kept working during the migration
- `public/data/` – course content (`course.json`) and dataset (`dataset.json`)
- `public/pglite/` – bundled database engine; `public/jsrunner.js` – local Supabase-style adapter for the JavaScript exercises
- `tests/` – browser checks
