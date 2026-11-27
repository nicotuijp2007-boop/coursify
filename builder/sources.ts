// Reads the course material in <course dir>/sources/ into passages with stable ids that every later step cites.
// Markdown and text are split on headings; Word files are converted to text first; PDFs are read by Claude
// (role "extract"), which also repairs headings and tables that text extraction breaks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mammoth from 'mammoth';
import type { Model } from './model';
import { Passages } from './schemas';

export interface Passage { id: string; doc: string; heading: string; text: string }
export interface SourcePack { passages: Passage[]; docs: { file: string; sha256: string; passages: number }[] }

const MAX_CHARS = 1600;
const slug = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'doc';

/** Splits text into passages under headings, keeping each passage under MAX_CHARS at paragraph boundaries. */
export function splitText(text: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = '', buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n\n').trim();
    if (body) out.push({ heading, text: body });
    buf = [];
  };
  for (const block of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b) continue;
    const h = b.match(/^#{1,6}\s+(.+)$/) ?? (b.length < 90 && !/[.:;,]$/.test(b) && /^[A-Z0-9]/.test(b) && !b.includes('\n') ? [b, b] : null);
    if (h) { flush(); heading = h[1].trim(); continue; }
    if (buf.join('\n\n').length + b.length > MAX_CHARS) flush();
    buf.push(b);
  }
  flush();
  return out;
}

export async function readSources(dir: string, model: Model, log: (s: string) => void): Promise<SourcePack> {
  const src = path.join(dir, 'sources');
  if (!fs.existsSync(src)) throw new Error(`Put the course material in ${src}/ (Markdown, text, Word or PDF).`);
  const files = fs.readdirSync(src).filter(f => !f.startsWith('.')).sort();
  if (!files.length) throw new Error(`${src}/ is empty.`);
  const pack: SourcePack = { passages: [], docs: [] };
  const used = new Set<string>();
  for (const file of files) {
    const full = path.join(src, file), ext = path.extname(file).toLowerCase();
    const bytes = fs.readFileSync(full);
    let parts: { heading: string; text: string }[];
    if (ext === '.md' || ext === '.txt') parts = splitText(bytes.toString('utf8'));
    else if (ext === '.docx') parts = splitText((await mammoth.extractRawText({ buffer: bytes })).value);
    else if (ext === '.pdf') {
      log(`  reading ${file} with Claude…`);
      const r = await model.call({
        role: 'extract', label: `extract ${file}`, maxTokens: 64000,
        system: 'You turn documents into clean study material. Keep the author\'s wording; do not summarise or add anything.',
        prompt: `Transcribe this document into passages of at most about ${MAX_CHARS} characters, each under the heading it belongs to. `
          + 'Fix broken line breaks and hyphenation, drop page headers, footers and page numbers, and write tables as short sentences or lists. '
          + 'Describe diagrams in one sentence in square brackets.',
        pdfs: [{ name: file, data: bytes.toString('base64') }],
        schema: Passages,
      });
      parts = r.passages;
    } else { log(`  skipping ${file}: only .md, .txt, .docx and .pdf are read`); continue; }
    let base = slug(file), k = 2;
    while (used.has(base)) base = `${slug(file)}-${k++}`;
    used.add(base);
    parts.forEach((p, i) => pack.passages.push({ id: `${base}:${i + 1}`, doc: file, heading: p.heading, text: p.text }));
    pack.docs.push({ file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), passages: parts.length });
    log(`  ${file}: ${parts.length} passages`);
  }
  if (!pack.passages.length) throw new Error('No readable text found in the sources.');
  return pack;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The source pack as prompt text. Identical for every call, so it can be cached. */
export function packText(pack: SourcePack): string {
  return pack.passages.map(p => `<source id="${p.id}" doc="${escapeAttr(p.doc)}" heading="${escapeAttr(p.heading)}">\n${p.text}\n</source>`).join('\n');
}
