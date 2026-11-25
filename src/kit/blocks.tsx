// Interactive teaching blocks embedded in lesson HTML as <div class="kblock" data-k="id">.
// Behaviour ported from the original course renderers (legacy.html, K.*). A block counts as done
// (progress map `kit`) on the same events as before.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Feedback, Inline, type FbTone } from '@/components/ui';
import { inline } from '@/lib/inline';
import { useApp } from '@/state/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
type B = any;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useDone(id: string) {
  const { P, setP } = useApp();
  return [!!P.kit[id], () => { if (!P.kit[id]) setP('kit', id, true); }] as const;
}

function Card({ tag, title, done, children }: { tag: string; title?: string; done?: boolean; children: ReactNode }) {
  return (
    <div className="kit" data-done={done || undefined}>
      <div className="kit-head"><span className="mp-eyebrow">{tag}{done ? ' · done' : ''}</span>{title && <Inline className="t" text={title} />}</div>
      <div className="kit-body">{children}</div>
    </div>
  );
}

type Fb = { tone: FbTone; title?: string; html: string } | null;
const FbView = ({ fb }: { fb: Fb }) => <div aria-live="polite">{fb && <Feedback key={fb.html + fb.title} tone={fb.tone} title={fb.title} html={fb.html} />}</div>;

function KTable({ head, rows, caption }: { head: string[]; rows: string[][]; caption?: string }) {
  return (
    <div className="prose" style={{ maxWidth: 'none' }}>
      <table>
        {caption && <caption className="res-label" style={{ textAlign: 'left' }}>{caption}</caption>}
        <thead><tr>{head.map((x, i) => <th key={i} scope="col" dangerouslySetInnerHTML={{ __html: inline(x) }} />)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j} dangerouslySetInnerHTML={{ __html: inline(x) }} />)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Mc({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [pick, setPick] = useState<number | null>(null);
  const good = b.options.findIndex((x: B) => x.correct);
  const o = pick === null ? null : b.options[pick];
  return (
    <Card tag="Question" title={b.question} done={done}>
      <div className="opts">
        {b.options.map((x: B, i: number) => (
          <button key={i} type="button" className={`opt${pick !== null && i === good ? ' is-ok' : ''}${pick === i && i !== good ? ' is-err' : ''}`} disabled={pick !== null}
            onClick={() => { setPick(i); if (x.correct) markDone(); }}>
            <span className="k">{String.fromCharCode(65 + i)}</span><Inline text={x.text} />
          </button>
        ))}
      </div>
      <FbView fb={o ? (o.correct ? { tone: 'ok', title: 'Correct', html: inline(o.why) } : { tone: 'err', title: 'Not quite', html: inline(o.why + ' ' + (b.options[good].why || '')) }) : null} />
      {o && !o.correct && <div><button type="button" className="btn-secondary" onClick={() => setPick(null)}>Try again</button></div>}
    </Card>
  );
}

function FlipCards({ b }: { b: B }) {
  const [, markDone] = useDone(b.id);
  const [flipped, setFlipped] = useState<boolean[]>(() => b.cards.map(() => false));
  const seen = useRef(new Set<number>());
  return (
    <div className="flips">
      {b.cards.map((cd: B, i: number) => (
        <button key={i} type="button" className="flip" aria-pressed={flipped[i]}
          onClick={() => { setFlipped(f => f.map((v, j) => (j === i ? !v : v))); seen.current.add(i); if (seen.current.size === b.cards.length) markDone(); }}>
          <span className="flip-inner">
            <span className="flip-face front">{cd.front}<small>{cd.hint || 'Select to turn over'}</small></span>
            <span className="flip-face back" dangerouslySetInnerHTML={{ __html: inline(cd.back) }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function Sort({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [fb, setFb] = useState<Fb>(null);
  const chip = (i: number) => {
    const it = b.items[i];
    const state = checked && placed[i] !== undefined ? (String(placed[i]) === String(it.cat) ? ' is-ok' : ' is-err') : '';
    return <button key={i} type="button" className={`chip-btn${state}${placed[i] !== undefined && !reduced() ? ' mp-fade-in' : ''}`} aria-pressed={selected === i}
      onClick={() => { setSelected(selected === i ? null : i); setChecked(false); }}>{it.text}</button>;
  };
  const check = () => {
    if (b.items.some((_: B, i: number) => placed[i] === undefined)) { setFb({ tone: 'info', html: inline(`Place all ${b.items.length} cards first.`) }); return; }
    const right = b.items.filter((it: B, i: number) => String(placed[i]) === String(it.cat)).length;
    setChecked(true);
    if (right === b.items.length) { setFb({ tone: 'ok', title: 'All correct', html: inline(b.why || 'Every card is in the right box.') }); markDone(); }
    else setFb({ tone: 'err', title: `${right} of ${b.items.length} correct`, html: inline('Move the red cards: select one and choose the other box.' + (b.hint ? ' ' + b.hint : '')) });
  };
  return (
    <Card tag="Sort" title={b.intro} done={done}>
      <div className="chip-row" aria-label="Cards to sort">{b.items.map((_: B, i: number) => placed[i] === undefined && chip(i))}</div>
      <div className="buckets">
        {b.categories.map((name: string, ci: number) => (
          <div className="bucket" key={ci}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => {
              if (selected === null) { setFb({ tone: 'info', html: 'First select a card, then choose its box.' }); return; }
              setPlaced(p => ({ ...p, [selected]: ci })); setSelected(null); setFb(null); setChecked(false);
            }}>Place in: {name}</button>
            <div className="chip-row">{b.items.map((_: B, i: number) => placed[i] === ci && chip(i))}</div>
          </div>
        ))}
      </div>
      <FbView fb={fb} />
      <div className="btn-row">
        <button type="button" className="btn-primary" onClick={check}>Check</button>
        <button type="button" className="btn-secondary" onClick={() => { setPlaced({}); setSelected(null); setChecked(false); setFb(null); }}>Start over</button>
      </div>
    </Card>
  );
}

function SpotErrors({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [marked, setMarked] = useState<boolean[]>(() => b.lines.map(() => false));
  const [checked, setChecked] = useState(false);
  const total = b.lines.filter((l: B) => l.error).length;
  let found = 0, wrong = 0;
  b.lines.forEach((l: B, i: number) => { if (l.error && marked[i]) found++; else if (!l.error && marked[i]) wrong++; });
  const notes = b.lines.map((l: B, i: number) => (l.error ? `<li>${inline('Line ' + (i + 1) + ': ' + l.error)}</li>` : '')).join('');
  return (
    <Card tag="Spot the errors" title={b.intro} done={done}>
      <div>
        {b.lines.map((l: B, i: number) => {
          const cls = !checked ? '' : l.error && marked[i] ? ' is-ok' : l.error ? ' is-missed' : marked[i] ? ' is-err' : '';
          return <button key={i} type="button" className={`code-line${cls}`} aria-pressed={marked[i]} disabled={checked}
            onClick={() => setMarked(m => m.map((v, j) => (j === i ? !v : v)))}>{l.text}</button>;
        })}
      </div>
      <FbView fb={checked ? { tone: found === total && wrong === 0 ? 'ok' : 'warn', title: `You found ${found} of ${total} mistake${total > 1 ? 's' : ''}${wrong ? ` (and marked ${wrong} correct line${wrong > 1 ? 's' : ''})` : ''}`, html: `<ul style="margin:8px 0 0;padding-left:1.2em;list-style:disc">${notes}</ul>` } : null} />
      <div className="btn-row">
        <button type="button" className="btn-primary" disabled={checked} onClick={() => { setChecked(true); markDone(); }}>Check</button>
        <button type="button" className="btn-secondary" onClick={() => { setChecked(false); setMarked(b.lines.map(() => false)); }}>Try again</button>
      </div>
    </Card>
  );
}

function Dilemma({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [pick, setPick] = useState<number | null>(null);
  const tones: Record<string, [FbTone, string]> = { good: ['ok', 'Good choice'], risky: ['warn', 'Risky'], bad: ['err', 'Think again'] };
  const o = pick === null ? null : b.options[pick];
  const t = o ? tones[o.verdict] || tones.risky : null;
  return (
    <Card tag="Dilemma" title={b.question} done={done}>
      <div className="scenario">{b.who && <div className="who">{b.who}</div>}<Inline as="div" text={b.scenario} /></div>
      <div className="opts">
        {b.options.map((x: B, i: number) => (
          <button key={i} type="button" className={`opt${pick === i ? (x.verdict === 'good' ? ' is-ok' : ' is-err') : ''}`} onClick={() => { setPick(i); markDone(); }}>
            <span className="k">{x.label}</span><Inline text={x.text} />
          </button>
        ))}
      </div>
      <FbView fb={o && t ? { tone: t[0], title: t[1], html: inline(o.outcome) } : null} />
      {o && b.advice && <Feedback tone="info" title="Advice" html={inline(b.advice)} pop={false} />}
    </Card>
  );
}

function Predict({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [pick, setPick] = useState<number | null>(null);
  return (
    <Card tag="Predict" title={b.question} done={done}>
      {b.code && <pre className="code"><code>{b.code}</code></pre>}
      <div className="opts" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(80px,1fr))' }}>
        {b.options.map((x: B, i: number) => (
          <button key={i} type="button" style={{ justifyContent: 'center' }} disabled={pick !== null}
            className={`opt${pick !== null && i === b.answer ? ' is-ok' : ''}${pick === i && i !== b.answer ? ' is-err' : ''}`}
            onClick={() => { setPick(i); markDone(); }}>{String(x)}</button>
        ))}
      </div>
      <FbView fb={pick === null ? null : { tone: pick === b.answer ? 'ok' : 'err', title: pick === b.answer ? 'You predicted it' : 'The answer is ' + b.options[b.answer], html: inline(b.why) }} />
      {pick !== null && b.reveal && <div className="mp-fade-in"><KTable head={b.reveal.head} rows={b.reveal.rows} caption="What the database returns" /></div>}
    </Card>
  );
}

function RoleTabs({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [cur, setCur] = useState(0);
  const seen = useRef(new Set([0]));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number, focus?: boolean) => {
    setCur(i); seen.current.add(i);
    if (focus) tabs.current[i]?.focus();
    if (seen.current.size === b.tabs.length) markDone();
  };
  const uid = 'rt-' + b.id, t = b.tabs[cur];
  return (
    <Card tag="Perspectives" title={b.title} done={done}>
      <div role="tablist" aria-label={b.label || 'Perspectives'} className="tabs">
        {b.tabs.map((x: B, i: number) => (
          <button key={i} ref={el => { tabs.current[i] = el; }} role="tab" type="button" className="tab" id={`${uid}-t${i}`} aria-controls={`${uid}-p`}
            aria-selected={i === cur} tabIndex={i === cur ? 0 : -1} onClick={() => select(i)}
            onKeyDown={e => {
              const n = b.tabs.length;
              if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
            }}>{x.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-p`} aria-labelledby={`${uid}-t${cur}`} tabIndex={0} key={cur} className="mp-fade-in prose">
        <Inline as="p" text={t.text} />
        {t.points && <ul>{t.points.map((p: string, i: number) => <li key={i} dangerouslySetInnerHTML={{ __html: inline(p) }} />)}</ul>}
      </div>
    </Card>
  );
}

function Builder({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const order: number[] = b.shuffle || b.pieces.map((_: B, i: number) => i);
  const [line, setLine] = useState<number[]>([]);
  const [fb, setFb] = useState<Fb>(null);
  const ok = fb?.tone === 'ok';
  const toggle = (idx: number) => { setLine(l => (l.includes(idx) ? l.filter(x => x !== idx) : [...l, idx])); setFb(null); };
  return (
    <Card tag="Build it" title={b.task} done={done}>
      <div className={`drop-line chip-row${ok ? ' is-ok' : ''}`} aria-live="polite" aria-label="Your answer">
        {line.length ? line.map(idx => <button key={idx} type="button" className="chip-btn mp-fade-in" onClick={() => toggle(idx)}>{b.pieces[idx]}</button>)
          : <span className="muted small">Select the pieces below in the right order…</span>}
      </div>
      <div className="chip-row">{order.filter(idx => !line.includes(idx)).map(idx => <button key={idx} type="button" className="chip-btn" onClick={() => toggle(idx)}>{b.pieces[idx]}</button>)}</div>
      <FbView fb={fb} />
      <div><button type="button" className="btn-primary" onClick={() => {
        if (line.length < b.pieces.length) { setFb({ tone: 'info', html: inline(`Use all ${b.pieces.length} pieces.`) }); return; }
        if (line.every((v, i) => v === i)) { setFb({ tone: 'ok', title: 'Correct', html: inline(b.success || '') }); markDone(); }
        else setFb({ tone: 'err', title: 'Not yet', html: inline(b.hint || 'Read it top to bottom: which piece must come first? Select a piece to put it back.') });
      }}>Check</button></div>
    </Card>
  );
}

function Stepper({ b }: { b: B }) {
  const [done, markDone] = useDone(b.id);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = b.steps.length;
  useEffect(() => { if (i === n - 1) markDone(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    if (i >= n - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI(x => x + 1), reduced() ? 3500 : 2600);
    return () => clearTimeout(t);
  }, [playing, i, n]);
  const shown = new Set<string>();
  for (let s = 0; s <= i; s++) (b.steps[s].show || []).forEach((id: string) => shown.add(id));
  const hl: string[] = b.steps[i].highlight || [];
  return (
    <Card tag="How it works" title={b.title} done={done}>
      <div className="stage" style={{ ['--cols' as string]: b.columns.length }}>
        {b.columns.map((col: B, ci: number) => (
          <div className="stage-col" key={ci}>
            <h4>{col.title}</h4>
            {col.items.filter((it: B) => !it.hidden || shown.has(it.id)).map((it: B) => (
              <div key={it.id} className={`stage-item${hl.includes(it.id) ? ' hl' : ''}${it.hidden ? ' appear' : ''}`}>{it.text}</div>
            ))}
          </div>
        ))}
      </div>
      <p className="caption" aria-live="polite" key={i}>
        {reduced() ? <Inline text={b.steps[i].caption} /> : b.steps[i].caption.split(' ').map((w: string, k: number) => (
          <span key={k}><span className="word" style={{ animationDelay: `${k * 40}ms` }} dangerouslySetInnerHTML={{ __html: inline(w) }} /> </span>
        ))}
      </p>
      <div className="btn-row">
        <button type="button" className="btn-secondary btn-sm" disabled={i === 0} onClick={() => { setPlaying(false); setI(i - 1); }}>← Back</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => { if (playing) { setPlaying(false); return; } if (i >= n - 1) setI(0); setPlaying(true); }}>{playing ? 'Pause' : '▶ Play'}</button>
        <button type="button" className="btn-secondary btn-sm" disabled={i === n - 1} onClick={() => { setPlaying(false); setI(i + 1); }}>Next →</button>
        <span className="muted small">Step {i + 1} of {n}</span>
      </div>
    </Card>
  );
}

const ThenNow = ({ b }: { b: B }) => (
  <div className="then-now">
    {[b.then, null, b.now].map((s: B, i) => s === null ? <div key={i} className="arrow" aria-hidden="true">→</div> : (
      <div key={i} className="card" style={i === 2 ? { borderColor: 'var(--primary)' } : undefined}>
        <h4 style={{ marginBottom: 'var(--space-2)' }}>{s.title}</h4>
        <ul className="ticks">{s.items.map((x: string, j: number) => <li key={j}><span dangerouslySetInnerHTML={{ __html: inline(x) }} /></li>)}</ul>
      </div>
    ))}
  </div>
);

const Callout = ({ b }: { b: B }) => <Feedback tone={b.tone === 'warning' ? 'warn' : 'info'} title={b.title} html={inline(b.text)} pop={false} />;

const BLOCKS: Record<string, (p: { b: B }) => ReactNode> = {
  mc: Mc, 'flip-cards': FlipCards, sort: Sort, 'spot-errors': SpotErrors, dilemma: Dilemma, predict: Predict,
  'role-tabs': RoleTabs, builder: Builder, stepper: Stepper, 'then-now': ThenNow, callout: Callout,
  table: ({ b }) => <KTable head={b.head} rows={b.rows} caption={b.caption} />,
};

export function KitBlock({ id }: { id: string }) {
  const { course } = useApp();
  const b = course.kit?.[id];
  const C = b && BLOCKS[b.type];
  if (!C) return null; // unknown blocks are dropped, as in the original
  return <C b={b} />;
}
