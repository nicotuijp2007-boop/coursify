// Inline markup used in kit block text: **bold** and `code` only; everything else is escaped.
// Same rules as the original course. The output is safe to set as HTML.
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const inline = (s: unknown) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
/** Remove one wrapping <p> from short course HTML (quiz questions and options). */
export const stripP = (html: string) => String(html).trim().replace(/^<p>([\s\S]*)<\/p>$/, '$1');
export const stripTags = (html: string) => String(html).replace(/<[^>]+>/g, '');
