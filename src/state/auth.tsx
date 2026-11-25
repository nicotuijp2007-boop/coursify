// Who is signed in. Every page needs an account: progress is saved per learner.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  session: Session | null;
  /** True after the learner opened a password-reset link: they must choose a new password. */
  recovering: boolean;
  doneRecovering: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Removes the one-time ?code= from a confirmation or reset link, keeping ?course= and the #route. */
function cleanAuthParams() {
  const u = new URL(location.href);
  let changed = false;
  for (const k of ['code', 'error', 'error_code', 'error_description']) if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
  if (changed) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}

export function AuthProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); cleanAuthParams(); } })
      .catch(() => { if (alive) setSession(null); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      cleanAuthParams();
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  if (session === undefined) return <>{fallback}</>;
  const value: AuthValue = {
    session, recovering,
    doneRecovering: () => setRecovering(false),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
