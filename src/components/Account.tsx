// The signed-in learner, with links to all courses and to sign out.
import { LayoutGrid, LogOut } from 'lucide-react';
import { useAuth } from '@/state/auth';

export function AccountMenu({ showCourses = false }: { showCourses?: boolean }) {
  const { session, signOut } = useAuth();
  return (
    <span className="account">
      {showCourses && <a className="btn-secondary btn-sm" href="./" title="All courses"><LayoutGrid size={15} aria-hidden="true" /><span className="lbl">All courses</span></a>}
      <span className="who small muted" title={session?.user.email}>{session?.user.email}</span>
      <button type="button" className="btn-ghost btn-sm" onClick={() => { void signOut(); }} title="Sign out"><LogOut size={15} aria-hidden="true" /><span className="lbl">Sign out</span></button>
    </span>
  );
}
