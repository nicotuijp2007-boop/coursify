// All courses, with where the learner stands in each.
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
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
    <main className="catalog" id="content">
      <div className="catalog-head">
        <div className="grow">
          <div className="mp-eyebrow">Coursify</div>
          <h1 tabIndex={-1}>Your courses</h1>
        </div>
        <AccountMenu />
      </div>
      {unknown && (
        <div className="banner" data-tone="warn" role="alert"><div><strong>That course does not exist.</strong>There is no course called “{unknown}”. Pick one below.</div></div>
      )}
      <div className="mod-grid">
        {catalog.courses.map(c => (
          <a key={c.id} className="card module-card catalog-card" href={courseHref(c.id)}>
            <div className="top">
              <span className="mp-chip" data-tone={studied[c.id] ? 'warn' : 'muted'}>
                {studied[c.id] ? `Last studied ${date(studied[c.id])}` : 'Not started'}
              </span>
            </div>
            <div className="mp-eyebrow">{c.eyebrow}</div>
            <h2>{c.title}</h2>
            <p>{c.summary}</p>
            <div className="catalog-foot"><span>{studied[c.id] ? "Continue" : "Start"}</span><ArrowRight size={16} aria-hidden="true" /></div>
          </a>
        ))}
      </div>
    </main>
  );
}
