// Loads the bundled engine from public/pglite at runtime. The engine is a prebuilt asset, not part of the
// Vite bundle, so it keeps working unchanged and is fetched only when the page needs it.
import type { EngineHost, PGliteLike } from './engine';

const asset = (p: string) => new URL(p, document.baseURI).href;
const nativeImport = (u: string) => import(/* @vite-ignore */ u);

async function compileWasm(url: string) {
  try { return await WebAssembly.compileStreaming(fetch(url)); }
  catch { return WebAssembly.compile(await (await ok(fetch(url))).arrayBuffer()); }
}

async function ok(r: Promise<Response>) {
  const res = await r;
  if (!res.ok) throw new Error(`Could not load ${res.url} (HTTP ${res.status}).`);
  return res;
}

let assets: Promise<Record<string, unknown>> | null = null;
function loadAssets() {
  assets ??= (async () => {
    const [text, wasmModule, initdbWasmModule] = await Promise.all([
      ok(fetch(asset('pglite/pglite-data.b64.txt'))).then(r => r.text()),
      compileWasm(asset('pglite/pglite.wasm')),
      compileWasm(asset('pglite/initdb.wasm')),
    ]);
    const bin = atob(text.trim());
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return { fsBundle: new Blob([u]), wasmModule, initdbWasmModule };
  })();
  assets.catch(() => { assets = null; }); // allow a retry after a failed download
  return assets;
}

export const browserHost: EngineHost = {
  async createDb(options) {
    const { PGlite } = await nativeImport(asset('pglite/index.js'));
    const db = new PGlite({ ...options, ...(await loadAssets()) });
    await db.waitReady;
    return db as PGliteLike;
  },
  loadJsRunner: () => nativeImport(asset('jsrunner.js')),
};
