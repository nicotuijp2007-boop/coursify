-- Coursify initial schema: AI-generated courses, lessons, quiz questions, learner progress.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  description text not null,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position int not null,
  title text not null,
  summary text not null,
  content text not null,
  unique (course_id, position)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position int not null,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  explanation text not null,
  unique (lesson_id, position)
);

create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  score int not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index on public.lessons (course_id);
create index on public.quiz_questions (lesson_id);

-- RLS: course content is public to read; only the service role (Netlify function) writes it.
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.lesson_progress enable row level security;

create policy "courses are readable" on public.courses for select using (true);
create policy "lessons are readable" on public.lessons for select using (true);
create policy "quiz questions are readable" on public.quiz_questions for select using (true);

create policy "users read own progress" on public.lesson_progress
  for select using ((select auth.uid()) = user_id);
create policy "users write own progress" on public.lesson_progress
  for insert with check ((select auth.uid()) = user_id);
create policy "users update own progress" on public.lesson_progress
  for update using ((select auth.uid()) = user_id);

-- Saves a generated course (shape of site/shared/course.ts) in one transaction.
create function public.save_generated_course(p_topic text, p_course jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_lesson_id uuid;
  v_lesson jsonb;
  v_question jsonb;
  v_li int := 0;
  v_qi int;
begin
  insert into public.courses (topic, title, description, level)
  values (p_topic, p_course->>'title', p_course->>'description', p_course->>'level')
  returning id into v_course_id;

  for v_lesson in select * from jsonb_array_elements(p_course->'lessons') loop
    insert into public.lessons (course_id, position, title, summary, content)
    values (v_course_id, v_li, v_lesson->>'title', v_lesson->>'summary', v_lesson->>'content')
    returning id into v_lesson_id;

    v_qi := 0;
    for v_question in select * from jsonb_array_elements(v_lesson->'quiz') loop
      insert into public.quiz_questions (lesson_id, position, question, options, correct_index, explanation)
      values (v_lesson_id, v_qi, v_question->>'question', v_question->'options',
              (v_question->>'correct_index')::int, v_question->>'explanation');
      v_qi := v_qi + 1;
    end loop;
    v_li := v_li + 1;
  end loop;

  return v_course_id;
end;
$$;

revoke execute on function public.save_generated_course(text, jsonb) from public, anon, authenticated;
