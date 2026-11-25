// All courses, with where the learner stands in each.
import { useEffect, useState } from 'react';
import { courseHref, type Catalog } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';
import { AccountMenu } from '@/components/Account';

export function CatalogPage({ catalog, unknown }: { catalog: Catalog; unknown?: string | null }) {
  const [studied, setStudied] = useState<Record<string, string>>({});
  useEffect(() => {
    document.title = 'Courses · Coursify';
    supabase.from('coursify_progress').select('course_id, updated_at').then(({ data }) => {
      if (data) setStudied(Object.fromEntries(data.map(r => [r.course_id as string, r.updated_at as string])));
    });
  }, []);
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="catalog-page">
      <header className="catalog-bar">
        <span className="catalog-brand">Coursify</span>
        <AccountMenu />
      </header>
      <main className="catalog" id="content">
        <h1 tabIndex={-1}>Courses</h1>
        <p className="catalog-lead">Choose a course to get started.</p>
        {unknown && (
          <div className="banner" data-tone="warn" role="alert"><div><strong>That course does not exist.</strong>There is no course called “{unknown}”. Pick one below.</div></div>
        )}
        <ul className="catalog-grid" role="list">
          {catalog.courses.map(c => (
            <li key={c.id} className="catalog-card">
              <h2 id={`course-${c.id}`}>{c.title}</h2>
              {studied[c.id] && <span className="mp-chip catalog-chip">Last studied {date(studied[c.id])}</span>}
              <p className="catalog-summary">{c.summary}</p>
              {c.modules ? <p className="catalog-count">{c.modules} modules</p> : null}
              <a className="btn-primary catalog-open" href={courseHref(c.id)} aria-describedby={`course-${c.id}`}>
                {studied[c.id] ? 'Continue course' : 'Open course'}
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
