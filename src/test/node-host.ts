// Loads the bundled engine from public/ in Node, for unit tests. The browser uses src/lib/browser-host.ts.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { EngineHost, PGliteLike } from '@/lib/engine';
import type { Course } from '@/lib/types';

const PUB = path.resolve(__dirname, '../../public');
let assets: Promise<Record<string, unknown>> | null = null;
// Node's own loader (require of ESM, Node 22+), so Vite does not transform the prebuilt engine,
// which ships without its .map files.
const nativeRequire = createRequire(import.meta.url);
const nativeImport = async (file: string) => nativeRequire(file);

function loadAssets() {
  assets ??= (async () => ({
    fsBundle: new Blob([Buffer.from(fs.readFileSync(path.join(PUB, 'pglite/pglite-data.b64.txt'), 'utf8').trim(), 'base64')]),
    wasmModule: await WebAssembly.compile(fs.readFileSync(path.join(PUB, 'pglite/pglite.wasm'))),
    initdbWasmModule: await WebAssembly.compile(fs.readFileSync(path.join(PUB, 'pglite/initdb.wasm'))),
  }))();
  return assets;
}

export const nodeHost: EngineHost = {
  async createDb(options) {
    const { PGlite } = await nativeImport(path.join(PUB, 'pglite/index.js'));
    const db = new PGlite({ ...options, ...(await loadAssets()) });
    await db.waitReady;
    return db as PGliteLike;
  },
  loadJsRunner: () => nativeImport(path.join(PUB, 'jsrunner.js')),
};

export function loadCourse(): { course: Course; dataset: string } {
  return {
    course: JSON.parse(fs.readFileSync(path.join(PUB, 'courses/sql/course.json'), 'utf8')),
    dataset: JSON.parse(fs.readFileSync(path.join(PUB, 'courses/sql/dataset.json'), 'utf8')).sql,
  };
}
