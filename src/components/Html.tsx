// Renders trusted course HTML (authored in the course build, see public/data/course.json) and
// mounts interactive blocks, copy buttons for code and download/copy buttons for student-app files.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KitBlock } from '@/kit/blocks';
import { useApp } from '@/state/app';

async function copy(text: string, toast: (t: string, tone?: 'ok' | 'err') => void, okText: string) {
  try { await navigator.clipboard.writeText(text); toast(okText, 'ok'); }
  catch { toast('Your browser blocked copying. Select the text and copy it yourself.', 'err'); }
}

function HtmlInner({ html, className = 'prose' }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { course, toast } = useApp();
  const [slots, setSlots] = useState<{ el: HTMLElement; id: string }[]>([]);
  // Same object on every render: React 19 rewrites innerHTML when this object changes identity, which
  // would wipe the mounted blocks and copy buttons after the first state update.
  const inner = useMemo(() => ({ __html: html }), [html]);

  useEffect(() => {
    const root = ref.current!;
    setSlots([...root.querySelectorAll<HTMLElement>('.kblock[data-k]')].map(el => ({ el, id: el.dataset.k! })));
    root.querySelectorAll<HTMLButtonElement>('button.copyfile').forEach(b => {
      if (b.dataset.wired) return;
      b.dataset.wired = '1';
      b.type = 'button';
      b.classList.add('btn-secondary', 'btn-sm');
      b.addEventListener('click', () => copy(course.files[b.dataset.file!] ?? '', toast, 'Copied. Paste it in the Supabase SQL editor and run it.'));
    });
    root.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.copy-btn')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'copy-btn'; b.textContent = 'Copy';
      b.setAttribute('aria-label', 'Copy code');
      b.addEventListener('click', () => copy((pre.querySelector('code') || pre).textContent || '', toast, 'Copied to the clipboard.'));
      pre.appendChild(b);
    });
  }, [html, course, toast]);

  return (
    <>
      <div ref={ref} className={className} dangerouslySetInnerHTML={inner} />
      {slots.map(s => createPortal(<KitBlock id={s.id} />, s.el, s.id))}
    </>
  );
}

/** Memoised so typing elsewhere on the page does not re-render long lesson text. */
export const Html = memo(HtmlInner);
