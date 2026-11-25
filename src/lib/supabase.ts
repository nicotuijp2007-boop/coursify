// Supabase client for accounts and saved progress (table public.coursify_progress, one row per
// learner per course, readable and writable only by that learner through row level security).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Progress } from './progress';
import type { ProgressBackend, RemoteRow } from './sync';

// Public by design (access is enforced by row level security). Defaults are built in so every build
// works, including uploads that leave out .env; VITE_SUPABASE_* in .env or the build overrides them.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nbeejssppyaikhveogip.supabase.co';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_VkUsgmOwfB1u5WdYmPY5OQ_-dxTmxqd';

export const supabaseConfigured = Boolean(url && key);

// PKCE puts the sign-up confirmation and password-reset codes in ?code=, so they never collide
// with the course's own #hash routes.
export const supabase: SupabaseClient = createClient(url || 'http://invalid.localhost', key || 'missing', {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

const TABLE = 'coursify_progress';

export function supabaseBackend(client: SupabaseClient, userId: string): ProgressBackend {
  return {
    async load(courseId: string): Promise<RemoteRow | null> {
      const { data, error } = await client.from(TABLE).select('progress, updated_at')
        .eq('user_id', userId).eq('course_id', courseId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as RemoteRow | null;
    },
    async save(courseId: string, progress: Progress): Promise<void> {
      const { error } = await client.from(TABLE).upsert(
        { user_id: userId, course_id: courseId, progress, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,course_id' },
      );
      if (error) throw new Error(error.message);
    },
  };
}
