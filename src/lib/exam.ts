// Final exam and certificate. Questions, answers and grading live in Supabase (functions
// coursify_exam_start / _save / _submit): the browser only ever sees questions without answers.
import { supabase } from './supabase';
import { moduleStatus } from './course-progress';
import type { Progress } from './progress';
import type { Course, Module } from './types';

export type QuestionKind = 'single' | 'multi' | 'value';
export interface ExamQuestion { id: string; topic: string; topic_title: string; kind: QuestionKind; prompt: string; options: string[] }
export type Answer = number | number[] | string;
export interface ExamAttempt { attempt_id: string; started_at: string; deadline: string; answers: Record<string, Answer>; questions: ExamQuestion[] }
export interface TopicResult { topic: string; title: string; correct: number; total: number }
export interface ExamResult {
  attempt_id: string; submitted_at: string; correct: number; total: number; score: number; passed: boolean;
  pass_percent: number; breakdown: TopicResult[]; retake_after: string | null; certificate_code: string | null;
}
export interface ExamSettings { course_id: string; title: string; questions_per_topic: number; pass_percent: number; time_limit_minutes: number; cooldown_hours: number }
export interface Certificate { code: string; full_name: string; course_title: string; score: number; issued_at: string }
export interface PastAttempt { id: string; started_at: string; deadline: string; submitted_at: string | null; score: number | null; passed: boolean | null; breakdown: TopicResult[] | null }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function loadExamState(courseId: string) {
  const [settings, attempts, cert, profile] = await Promise.all([
    supabase.from('coursify_exams').select('course_id, title, questions_per_topic, pass_percent, time_limit_minutes, cooldown_hours').eq('course_id', courseId).maybeSingle(),
    supabase.from('coursify_exam_attempts').select('id, started_at, deadline, submitted_at, score, passed, breakdown').eq('course_id', courseId).order('started_at', { ascending: false }).limit(10),
    supabase.from('coursify_certificates').select('code, full_name, course_title, score, issued_at').eq('course_id', courseId).maybeSingle(),
    supabase.from('coursify_profiles').select('full_name').maybeSingle(),
  ]);
  fail(settings.error); fail(attempts.error); fail(cert.error); fail(profile.error);
  return {
    settings: settings.data as ExamSettings | null,
    attempts: (attempts.data ?? []) as PastAttempt[],
    certificate: cert.data as Certificate | null,
    fullName: (profile.data?.full_name as string | undefined) ?? '',
  };
}

export async function saveFullName(userId: string, fullName: string) {
  const { error } = await supabase.from('coursify_profiles').upsert({ user_id: userId, full_name: fullName.trim(), updated_at: new Date().toISOString() });
  fail(error);
}

export async function startExam(courseId: string): Promise<ExamAttempt> {
  const { data, error } = await supabase.rpc('coursify_exam_start', { p_course: courseId });
  fail(error);
  return data as ExamAttempt;
}

export async function saveAnswers(attemptId: string, answers: Record<string, Answer>) {
  const { error } = await supabase.rpc('coursify_exam_save', { p_attempt: attemptId, p_answers: answers });
  fail(error);
}

export async function submitExam(attemptId: string, answers: Record<string, Answer>): Promise<ExamResult> {
  const { data, error } = await supabase.rpc('coursify_exam_submit', { p_attempt: attemptId, p_answers: answers });
  fail(error);
  return data as ExamResult;
}

export async function verifyCertificate(code: string): Promise<(Certificate & { valid: true }) | { valid: false }> {
  const { data, error } = await supabase.rpc('coursify_certificate_verify', { p_code: code });
  fail(error);
  return data;
}

/** The exam unlocks once every core module's checkpoint is passed: its practical, and its quiz where it has one. */
export function examReadiness(course: Course, P: Progress): { ready: boolean; missing: Module[] } {
  const missing = course.modules.filter(m => m.kind === 'core' && m.checkpoint && (
    (m.checkpoint.practical && moduleStatus(course, P, m) !== 'completed')
    || (m.checkpoint.quiz.some(q => q.type === 'mc') && !P.quizBest[m.id]?.passed)));
  return { ready: missing.length === 0, missing };
}

export const answered = (a: Answer | undefined) =>
  a !== undefined && (Array.isArray(a) ? a.length > 0 : typeof a === 'string' ? a.trim() !== '' : true);

export const verifyUrl = (code: string) => `${location.origin}${location.pathname}?verify=${encodeURIComponent(code)}`;

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
