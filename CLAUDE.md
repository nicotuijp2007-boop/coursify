# Coursify: project specifics

- Supabase project ref: `nbeejssppyaikhveogip` (shared "Dashboard" project), URL https://nbeejssppyaikhveogip.supabase.co
- Tables: `courses`, `lessons`, `quiz_questions`, `lesson_progress` (RLS on all); RPC `save_generated_course(p_topic, p_course)` (service role only). Migration `coursify_init` applied 2026-11-25.
- Other tables in that project (`posts`, `issues`, `issues_backup_w47`, `chunks`) belong to Dashboard, not Coursify.
- n8n workflows: none
- Netlify site name: `coursify-ntny` (id `6dcd24b2-dcd9-4696-a203-591aecd5df64`), base dir `site/`, function `/api/generate-course`
- Course JSON shape lives in `site/shared/course.ts` (Zod); the migration's RPC must match it.
