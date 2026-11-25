# coursify

Develop courses to learn stuff in an interactive way: type a topic, Claude writes a short course (lessons + quizzes), and you work through it in the browser.

## Stack
- **Front-end**: Vite + TypeScript in `site/`, deployed on Netlify
- **API**: Netlify Function `site/netlify/functions/generate-course.mts` → `POST /api/generate-course` (Claude Opus 5.5 with structured output)
- **Database**: Supabase (`supabase/migrations/`), stores generated courses and learner progress. Optional: without Supabase env vars, courses are generated but not saved.

## Run locally
```bash
cd site && npm install
cp ../.env.example .env   # fill in values
npx netlify dev           # site + function on http://localhost:8888
```

## What's where
| Path | Contents |
| --- | --- |
| `netlify.toml` | Netlify build config (base `site/`) |
| `site/src/` | UI: topic form, lesson + quiz rendering |
| `site/shared/course.ts` | Course schema (Zod), shared by UI and function |
| `site/netlify/functions/` | Course generator |
| `supabase/migrations/` | Schema, RLS policies, `save_generated_course` RPC |
