// Code editor: a textarea that grows with its content.
// Keys: Tab indents (two spaces); Esc, then Tab, leaves the editor; Ctrl/Cmd+Enter runs.
import { useEffect, useId, useLayoutEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  label: string;
  plain?: boolean;
  placeholder?: string;
}

export function Editor({ value, onChange, onRun, label, plain, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const escaped = useRef(false);
  const id = useId();

  const fit = () => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(520, Math.max(104, ta.scrollHeight + 2)) + 'px';
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const ro = new ResizeObserver(() => fit());
    if (ref.current) ro.observe(ref.current.parentElement!);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="editor-wrap">
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea
        id={id}
        ref={ref}
        className={`editor${plain ? ' plain' : ''}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={plain ? undefined : id + '-hint'}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { escaped.current = true; return; }
          if (e.key === 'Tab' && !plain && !e.shiftKey && !escaped.current) {
            e.preventDefault();
            const ta = e.currentTarget, s = ta.selectionStart;
            ta.setRangeText('  ', s, ta.selectionEnd, 'end');
            onChange(ta.value);
            return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onRun) { e.preventDefault(); onRun(); }
          escaped.current = false;
        }}
        onBlur={() => { escaped.current = false; }}
      />
      {!plain && (
        <p className="editor-hint" id={id + '-hint'}>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs · <kbd>Tab</kbd> indents · <kbd>Esc</kbd> then <kbd>Tab</kbd> leaves the editor
        </p>
      )}
    </div>
  );
}
