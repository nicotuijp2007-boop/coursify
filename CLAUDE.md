# Coursify: project specifics

- Supabase project ref: _not created yet_
- Tables: `courses`, `lessons`, `quiz_questions`, `lesson_progress` (RLS on all); RPC `save_generated_course(p_topic, p_course)` (service role only)
- n8n workflows: none
- Netlify site name: _not created yet_ (base dir `site/`, function `/api/generate-course`)
- Course JSON shape lives in `site/shared/course.ts` (Zod); the migration's RPC must match it.
