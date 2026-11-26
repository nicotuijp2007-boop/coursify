-- Coursify final exams and certificates.
-- Questions and answers live only in coursify_exam_questions, which no learner can read: the exam is
-- started, saved and graded by the functions below (SECURITY DEFINER), so answers never reach the browser.
-- The question pool itself is not in this repository (the repository is public); it is loaded into
-- Supabase separately.

create table public.coursify_exams (
  course_id text primary key check (course_id ~ '^[a-z0-9-]{1,64}$'),
  title text not null,
  questions_per_topic int not null default 2 check (questions_per_topic between 1 and 10),
  pass_percent int not null default 75 check (pass_percent between 1 and 100),
  time_limit_minutes int not null default 60 check (time_limit_minutes between 5 and 600),
  cooldown_hours int not null default 24 check (cooldown_hours between 0 and 720),
  active boolean not null default true
);

create table public.coursify_exam_questions (
  id text primary key,
  course_id text not null references public.coursify_exams (course_id) on delete cascade,
  topic text not null,                 -- module id, e.g. m05
  topic_title text not null,
  position int not null,               -- order in the exam
  kind text not null check (kind in ('single', 'multi', 'value')),
  prompt text not null,                -- trusted HTML
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct jsonb not null,              -- single: 2 · multi: [0, 2] · value: {"value": 60, "tolerance": 0}
  explain text not null default '',
  active boolean not null default true
);
create index on public.coursify_exam_questions (course_id, topic);

create table public.coursify_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  updated_at timestamptz not null default now()
);

create table public.coursify_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null references public.coursify_exams (course_id),
  question_ids text[] not null,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  correct int,
  total int,
  score int,
  passed boolean,
  breakdown jsonb
);
create index on public.coursify_exam_attempts (user_id, course_id, started_at desc);

create table public.coursify_certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null references public.coursify_exams (course_id),
  attempt_id uuid not null references public.coursify_exam_attempts (id),
  full_name text not null,
  course_title text not null,
  score int not null,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.coursify_exams enable row level security;
alter table public.coursify_exam_questions enable row level security;
alter table public.coursify_profiles enable row level security;
alter table public.coursify_exam_attempts enable row level security;
alter table public.coursify_certificates enable row level security;

-- Exam settings are not secret; questions have no policy at all (nobody can read them directly).
create policy "signed-in users read exam settings" on public.coursify_exams for select to authenticated using (active);
create policy "learners read own profile" on public.coursify_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "learners add own profile" on public.coursify_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "learners update own profile" on public.coursify_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "learners read own attempts" on public.coursify_exam_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "learners read own certificates" on public.coursify_certificates for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.coursify_exams, public.coursify_exam_questions, public.coursify_profiles,
  public.coursify_exam_attempts, public.coursify_certificates from anon, authenticated;
grant select on public.coursify_exams to authenticated;
grant select, insert, update on public.coursify_profiles to authenticated;
grant select on public.coursify_exam_attempts, public.coursify_certificates to authenticated;

-- "69,816.60", "69816,60", "€ 69 816.60" → 69816.60; anything else → null.
create function public.coursify_parse_number(p text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare s text := regexp_replace(coalesce(p, ''), '[€\s]', '', 'g');
begin
  if s ~ ',' and s ~ '\.' then s := replace(s, ',', '');
  elsif s ~ ',' then s := replace(s, ',', '.');
  end if;
  return s::numeric;
exception when others then return null;
end $$;

-- Questions as the learner sees them: no correct answers, no explanations.
create function public.coursify_exam_payload(p_attempt public.coursify_exam_attempts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'attempt_id', p_attempt.id, 'started_at', p_attempt.started_at, 'deadline', p_attempt.deadline,
    'answers', p_attempt.answers,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'topic', q.topic, 'topic_title', q.topic_title,
        'kind', q.kind, 'prompt', q.prompt, 'options', q.options) order by q.position)
      from public.coursify_exam_questions q where q.id = any (p_attempt.question_ids)), '[]'::jsonb));
$$;

-- Grades an attempt from its stored answers and issues a certificate on a pass. Internal only.
create function public.coursify_exam_grade(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.coursify_exam_attempts;
  e public.coursify_exams;
  q record;
  ans jsonb;
  ok boolean;
  n_ok int := 0;
  n int := 0;
  pct int;
  topics jsonb := '{}'::jsonb;
  cert_code text;
begin
  select * into a from public.coursify_exam_attempts where id = p_attempt_id for update;
  select * into e from public.coursify_exams where course_id = a.course_id;
  if a.submitted_at is null then
    for q in select * from public.coursify_exam_questions where id = any (a.question_ids) order by position loop
      ans := a.answers -> q.id;
      ok := case q.kind
        when 'single' then jsonb_typeof(ans) = 'number' and ans = q.correct
        when 'multi' then jsonb_typeof(ans) = 'array'
          and (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(ans) v)
            = (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(q.correct) v)
        when 'value' then abs(public.coursify_parse_number(ans #>> '{}') - (q.correct ->> 'value')::numeric)
            <= coalesce((q.correct ->> 'tolerance')::numeric, 0)
        else false end;
      ok := coalesce(ok, false);
      n := n + 1;
      if ok then n_ok := n_ok + 1; end if;
      topics := jsonb_set(topics, array[q.topic], jsonb_build_object(
        'topic', q.topic, 'title', q.topic_title, 'position', coalesce((topics -> q.topic ->> 'position')::int, q.position),
        'correct', coalesce((topics -> q.topic ->> 'correct')::int, 0) + case when ok then 1 else 0 end,
        'total', coalesce((topics -> q.topic ->> 'total')::int, 0) + 1));
    end loop;
    pct := case when n = 0 then 0 else floor(100.0 * n_ok / n)::int end;
    update public.coursify_exam_attempts set submitted_at = now(), correct = n_ok, total = n, score = pct,
      passed = pct >= e.pass_percent,
      breakdown = (select coalesce(jsonb_agg(v order by (v ->> 'position')::int), '[]'::jsonb) from jsonb_each(topics) t(k, v))
      where id = a.id returning * into a;
    if a.passed and not exists (select 1 from public.coursify_certificates where user_id = a.user_id and course_id = a.course_id) then
      loop
        cert_code := 'CFY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-'
          || upper(substr(md5(random()::text || a.id::text), 1, 4));
        exit when not exists (select 1 from public.coursify_certificates where code = cert_code);
      end loop;
      insert into public.coursify_certificates (code, user_id, course_id, attempt_id, full_name, course_title, score)
      select cert_code, a.user_id, a.course_id, a.id, p.full_name, e.title, a.score
      from public.coursify_profiles p where p.user_id = a.user_id;
    end if;
  end if;
  return jsonb_build_object('attempt_id', a.id, 'submitted_at', a.submitted_at, 'correct', a.correct, 'total', a.total,
    'score', a.score, 'passed', a.passed, 'pass_percent', e.pass_percent, 'breakdown', a.breakdown,
    'retake_after', case when a.passed then null else a.submitted_at + make_interval(hours => e.cooldown_hours) end,
    'certificate_code', (select code from public.coursify_certificates c where c.user_id = a.user_id and c.course_id = a.course_id));
end $$;

-- Starts an exam (or returns the one in progress). Raises a readable error when the learner can't start.
create function public.coursify_exam_start(p_course text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.coursify_exams;
  a public.coursify_exam_attempts;
  last public.coursify_exam_attempts;
  ids text[];
begin
  if uid is null then raise exception 'Sign in to take the exam.'; end if;
  select * into e from public.coursify_exams where course_id = p_course and active;
  if not found then raise exception 'This course has no final exam yet.'; end if;
  if not exists (select 1 from public.coursify_profiles where user_id = uid) then
    raise exception 'Enter your full name for the certificate first.';
  end if;
  if exists (select 1 from public.coursify_certificates where user_id = uid and course_id = p_course) then
    raise exception 'You already passed this exam.';
  end if;

  -- Close attempts whose time ran out, grading what was saved.
  for a in select * from public.coursify_exam_attempts
    where user_id = uid and course_id = p_course and submitted_at is null and deadline + interval '2 minutes' < now() loop
    perform public.coursify_exam_grade(a.id);
  end loop;

  select * into a from public.coursify_exam_attempts
    where user_id = uid and course_id = p_course and submitted_at is null order by started_at desc limit 1;
  if found then return public.coursify_exam_payload(a); end if;

  select * into last from public.coursify_exam_attempts
    where user_id = uid and course_id = p_course and submitted_at is not null order by submitted_at desc limit 1;
  if found and not last.passed and last.submitted_at + make_interval(hours => e.cooldown_hours) > now() then
    raise exception 'You can retake the exam from %.',
      to_char((last.submitted_at + make_interval(hours => e.cooldown_hours)) at time zone 'Europe/Amsterdam', 'DD Mon YYYY HH24:MI')
      using hint = (last.submitted_at + make_interval(hours => e.cooldown_hours))::text;
  end if;

  select array_agg(id order by position) into ids from (
    select id, position, row_number() over (partition by topic order by random()) as rn
    from public.coursify_exam_questions where course_id = p_course and active) s
  where rn <= e.questions_per_topic;
  if ids is null then raise exception 'This exam has no questions yet.'; end if;

  insert into public.coursify_exam_attempts (user_id, course_id, question_ids, deadline)
  values (uid, p_course, ids, now() + make_interval(mins => e.time_limit_minutes)) returning * into a;
  return public.coursify_exam_payload(a);
end $$;

-- Autosaves answers while the exam runs, so a closed tab or a lost connection costs nothing.
create function public.coursify_exam_save(p_attempt uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 100000 then raise exception 'Answers are not valid.'; end if;
  update public.coursify_exam_attempts set answers = p_answers
  where id = p_attempt and user_id = auth.uid() and submitted_at is null and now() <= deadline + interval '2 minutes';
  if not found then raise exception 'This exam is closed.'; end if;
end $$;

-- Hands the exam in. Answers sent after the time limit are ignored; the last saved answers count.
create function public.coursify_exam_submit(p_attempt uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.coursify_exam_attempts;
begin
  select * into a from public.coursify_exam_attempts where id = p_attempt and user_id = auth.uid();
  if not found then raise exception 'Exam attempt not found.'; end if;
  if a.submitted_at is null and now() <= a.deadline + interval '2 minutes'
     and jsonb_typeof(p_answers) = 'object' and pg_column_size(p_answers) <= 100000 then
    update public.coursify_exam_attempts set answers = p_answers where id = a.id;
  end if;
  return public.coursify_exam_grade(a.id);
end $$;

-- Public check of a certificate code: only what is printed on the certificate.
create function public.coursify_certificate_verify(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('valid', true, 'code', c.code, 'full_name', c.full_name,
      'course_title', c.course_title, 'score', c.score, 'issued_at', c.issued_at)
    from public.coursify_certificates c where c.code = upper(btrim(p_code))), jsonb_build_object('valid', false));
$$;

revoke all on function public.coursify_parse_number(text), public.coursify_exam_payload(public.coursify_exam_attempts),
  public.coursify_exam_grade(uuid), public.coursify_exam_start(text), public.coursify_exam_save(uuid, jsonb),
  public.coursify_exam_submit(uuid, jsonb), public.coursify_certificate_verify(text) from public, anon, authenticated;
grant execute on function public.coursify_exam_start(text), public.coursify_exam_save(uuid, jsonb),
  public.coursify_exam_submit(uuid, jsonb) to authenticated;
grant execute on function public.coursify_certificate_verify(text) to anon, authenticated;
