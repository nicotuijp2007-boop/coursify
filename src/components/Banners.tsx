// Persistent notices: database engine problems, saved progress that could not be read or sent.
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useApp } from '@/state/app';

export function Banners() {
  const { status, storageIssue, saveFailed, cloud, source } = useApp();
  return (
    <>
      {status.state === 'unavailable' && (
        <div className="banner" data-tone="err" role="alert"><CircleAlert size={20} aria-hidden="true" />
          <div><strong>The in-page database could not start in this browser.</strong>
            You can still read every lesson and see the expected outputs; run your SQL in the Supabase SQL editor instead. Reloading the page tries again.</div></div>
      )}
      {status.state === 'error' && (
        <div className="banner" data-tone="err" role="alert"><CircleAlert size={20} aria-hidden="true" />
          <div><strong>The practice database for this lesson could not be built.</strong>Use Reset database to try again. If it keeps failing, reload the page.</div></div>
      )}
      {cloud === 'failed' && (
        <div className="banner" data-tone="warn" role="alert"><TriangleAlert size={20} aria-hidden="true" />
          <div><strong>Your latest progress has not reached your account yet.</strong>
            {saveFailed ? 'Keep this tab open: it keeps trying and saves as soon as the connection is back.' : 'It is kept in this browser and sent as soon as the connection is back.'}</div></div>
      )}
      {source === 'imported' && cloud === 'saved' && (
        <div className="banner" data-tone="ok" role="status"><CircleAlert size={20} aria-hidden="true" />
          <div><strong>Progress from this browser was added to your account.</strong>From now on it follows you to every device you sign in on.</div></div>
      )}
      {(storageIssue?.kind === 'malformed' || storageIssue?.kind === 'repaired') && (
        <div className="banner" data-tone="warn"><TriangleAlert size={20} aria-hidden="true" />
          <div><strong>Some saved progress could not be read.</strong>
            {storageIssue.kind === 'repaired' ? `These parts were reset: ${storageIssue.fields.join(', ')}. ` : 'The course started with fresh progress. '}
            {storageIssue.backupKey ? `A copy of the original data is kept in this browser under "${storageIssue.backupKey}".` : ''}</div></div>
      )}

    </>
  );
}
