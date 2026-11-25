// Persistent notices about things that limit the course in this browser.
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useApp } from '@/state/app';

export function Banners() {
  const { status, storageIssue, saveFailed } = useApp();
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
      {storageIssue?.kind === 'unavailable' && (
        <div className="banner" data-tone="warn"><TriangleAlert size={20} aria-hidden="true" />
          <div><strong>Progress is not saved in this browser.</strong>The browser blocks local storage (for example in a private window). Your answers last until you close this tab.</div></div>
      )}
      {(storageIssue?.kind === 'malformed' || storageIssue?.kind === 'repaired') && (
        <div className="banner" data-tone="warn"><TriangleAlert size={20} aria-hidden="true" />
          <div><strong>Some saved progress could not be read.</strong>
            {storageIssue.kind === 'repaired' ? `These parts were reset: ${storageIssue.fields.join(', ')}. ` : 'The course started with fresh progress. '}
            {storageIssue.backupKey ? `A copy of the original data is kept in this browser under "${storageIssue.backupKey}".` : 'A backup copy could not be stored.'}</div></div>
      )}
      {saveFailed && storageIssue?.kind !== 'unavailable' && (
        <div className="banner" data-tone="warn" role="alert"><TriangleAlert size={20} aria-hidden="true" />
          <div><strong>Your latest progress could not be saved.</strong>The browser refused to store it (storage may be full). Keep this tab open.</div></div>
      )}
    </>
  );
}
