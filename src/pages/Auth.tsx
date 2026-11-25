// Sign in, create an account, reset a forgotten password, and set a new one from a reset link.
import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

type Mode = 'sign-in' | 'sign-up' | 'forgot';

/** Address that confirmation and reset links come back to: this page, without the #route. */
const returnUrl = () => location.origin + location.pathname + location.search;

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match an account.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link in the email we sent you.';
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/password/i.test(message) && /(least|short|weak)/i.test(message)) return message.endsWith('.') ? message : message + '.';
  if (/fetch|network/i.test(message)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return message;
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (m: Mode) => { setMode(m); setError(null); setNotice(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } });
        if (error) throw error;
        // With email confirmation on, there is no session yet; with it off, onAuthStateChange signs in.
        if (!data.session) { setNotice(`We sent a confirmation link to ${email}. Open it to finish creating your account.`); setPassword(''); }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
        if (error) throw error;
        setNotice(`If an account exists for ${email}, we sent it a link to choose a new password.`);
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'sign-in' ? 'Sign in to Coursify' : mode === 'sign-up' ? 'Create your account' : 'Reset your password';
  return (
    <div className="boot auth">
      <form className="card auth-card" onSubmit={submit} aria-labelledby="auth-h" noValidate={false}>
        <div className="mp-eyebrow">Coursify</div>
        <h1 id="auth-h" tabIndex={-1}>{title}</h1>
        <p className="muted">{mode === 'forgot' ? 'Enter your email and we will send you a reset link.' : 'Your progress is saved to your account, on every device.'}</p>
        <label className="auth-field">
          <span>Email</span>
          <input className="input" type="email" name="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label className="auth-field">
            <span>Password</span>
            <input className="input" type="password" name="password" required minLength={mode === 'sign-up' ? 8 : undefined}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
            {mode === 'sign-up' && <small className="muted">At least 8 characters.</small>}
          </label>
        )}
        {error && <p className="auth-msg" data-tone="err" role="alert">{error}</p>}
        {notice && <p className="auth-msg" data-tone="ok" role="status">{notice}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}
        </button>
        <div className="auth-links">
          {mode === 'sign-in' && <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => switchTo('sign-up')}>Create an account</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => switchTo('forgot')}>Forgot password?</button>
          </>}
          {mode !== 'sign-in' && <button type="button" className="btn-ghost btn-sm" onClick={() => switchTo('sign-in')}>Back to sign in</button>}
        </div>
      </form>
    </div>
  );
}

export function NewPasswordPage() {
  const { doneRecovering } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(friendly(error.message)); else doneRecovering();
  };
  return (
    <div className="boot auth">
      <form className="card auth-card" onSubmit={submit} aria-labelledby="np-h">
        <div className="mp-eyebrow">Coursify</div>
        <h1 id="np-h" tabIndex={-1}>Choose a new password</h1>
        <label className="auth-field">
          <span>New password</span>
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          <small className="muted">At least 8 characters.</small>
        </label>
        {error && <p className="auth-msg" data-tone="err" role="alert">{error}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Save password'}</button>
      </form>
    </div>
  );
}
