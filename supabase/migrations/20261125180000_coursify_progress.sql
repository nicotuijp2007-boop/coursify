-- Coursify: one row of saved progress per learner per course.
-- Applied to the Supabase project "Dashboard" (nbeejssppyaikhveogip) on 2026-11-25.
create table public.coursify_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id text not null check (course_id ~ '^[a-z0-9-]{1,64}$'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object' and pg_column_size(progress) < 2000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

alter table public.coursify_progress enable row level security;

create policy "learners read own progress" on public.coursify_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "learners add own progress" on public.coursify_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "learners update own progress" on public.coursify_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.coursify_progress from anon;
grant select, insert, update on public.coursify_progress to authenticated;
