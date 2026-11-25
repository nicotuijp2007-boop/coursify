// Small shared UI pieces.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { inline } from '@/lib/inline';
import type { ResultTable as Table } from '@/lib/types';
import type { ExerciseState } from '@/lib/course-progress';

/** Inline-markup text (**bold**, `code`) from kit blocks. */
export function Inline({ text, as: Tag = 'span', className }: { text?: string; as?: 'span' | 'p' | 'div' | 'strong'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: inline(text) }} />;
}

export type FbTone = 'ok' | 'warn' | 'err' | 'info';
const FB_ICON = { ok: CircleCheck, warn: TriangleAlert, err: CircleAlert, info: Info };

/** Feedback panel. Tone is carried by an icon and a bold lead word as well as colour. */
export function Feedback({ tone, title, children, html, pop = true }: { tone: FbTone; title?: string; children?: ReactNode; html?: string; pop?: boolean }) {
  const Icon = FB_ICON[tone];
  return (
    <div className={`fb ${tone}${pop ? ' mp-pop' : ''}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <div className="fb-body">
        {title && <strong>{title}</strong>}
        {html !== undefined ? <span dangerouslySetInnerHTML={{ __html: html }} /> : children}
      </div>
    </div>
  );
}

const isNum = (v: unknown) => v === null || /^-?\d+(\.\d+)?$/.test(String(v));

/** A query result. `max` limits rendered rows; the footer says how many exist. */
export function ResultTable({ t, max = 50 }: { t: Table | null | undefined; max?: number }) {
  if (!t) return null;
  if (!t.cols.length) return <Feedback tone="info" pop={false}>Statement ran{t.affected ? `: ${t.affected} row(s) affected` : ''}.</Feedback>;
  const rows = t.rows.slice(0, max);
  const numeric = t.cols.map((_, i) => rows.length > 0 && rows.every(r => isNum(r[i])));
  const n = t.rowCount ?? t.rows.length;
  return (
    <div className="result">
      <div className="result-scroll" tabIndex={0} role="region" aria-label="Query result">
        <table>
          <thead><tr>{t.cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((v, ci) => v === null
                ? <td key={ci} className="null">null</td>
                : <td key={ci} className={numeric[ci] ? 'num' : undefined}>{typeof v === 'boolean' ? String(v) : String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="result-foot">{n === 0 ? 'No rows' : n > rows.length ? `1–${rows.length} of ${n} rows` : `${n} row${n === 1 ? '' : 's'}`}</div>
    </div>
  );
}

export const ResLabel = ({ children }: { children: ReactNode }) => <div className="res-label">{children}</div>;

export function Logs({ logs, error, blocked }: { logs?: string[]; error?: string | null; blocked?: boolean }) {
  return (
    <>
      {logs && logs.length ? <pre className="logs"><code>{logs.join('\n')}</code></pre> : !error && <p className="muted small">The code ran and printed nothing.</p>}
      {error && (blocked ? <Feedback tone="info">{error}</Feedback> : <Feedback tone="err" title="Error:">{error}</Feedback>)}
    </>
  );
}

const STATUS: Record<ExerciseState, [string, string]> = {
  'not-started': ['Not started', 'muted'],
  tried: ['In progress', 'info'],
  revealed: ['Solution viewed', 'warn'],
  passed: ['Passed', 'ok'],
};

/** Exercise status chip; pops when the state changes after mount. */
export function StatusChip({ state }: { state: ExerciseState }) {
  const [label, tone] = STATUS[state];
  const first = useRef(true);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setChanged(true);
    const t = setTimeout(() => setChanged(false), 400);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <span className={`mp-chip status-chip${changed ? ' changed' : ''}`} data-tone={tone === 'info' ? undefined : tone}>
      {state === 'passed' && <CircleCheck size={14} aria-hidden="true" />}{label}
    </span>
  );
}

/** Shows content after it scrolls into view. Without IntersectionObserver, or with reduced motion,
 *  the content is simply visible (data-reveal="static"). */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div', ...rest }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'li'; [k: string]: unknown }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return; // already visible: no animation needed
    el.dataset.reveal = 'armed';
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { el.dataset.reveal = 'shown'; io.disconnect(); }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
    io.observe(el);
    // Safety net: never leave content hidden if the observer does not fire (e.g. after a jump link).
    const t = setTimeout(() => { if (el.dataset.reveal === 'armed' && el.getBoundingClientRect().top < window.innerHeight) el.dataset.reveal = 'shown'; }, 1200);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  const Comp = Tag as 'div';
  return <Comp ref={ref as React.RefObject<HTMLDivElement>} className={`mp-reveal ${className}`} data-reveal="static" style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>{children}</Comp>;
}

/** Busy-aware button: shows a spinner and keeps its width while an async action runs. */
export function ActButton({ onClick, busy, children, className = 'btn-secondary', ...rest }: { onClick: () => void; busy?: boolean; children: ReactNode; className?: string; [k: string]: unknown }) {
  return (
    // aria-disabled instead of disabled: a disabled button drops keyboard focus while the action runs.
    <button type="button" className={className} onClick={() => { if (!busy) onClick(); }} aria-disabled={busy || undefined} aria-busy={busy || undefined} {...rest}>
      {busy && <span className="spin" aria-hidden="true" />}{children}
    </button>
  );
}
