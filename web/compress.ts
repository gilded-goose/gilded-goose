// After the build: a Brotli and a gzip copy of every text file the site serves (Track F), and of each WebAssembly file in
// dist/assets (Track V, 029: ONNX Runtime, 27 MB raw). The server serves the compressed copy to a browser that accepts it
// (serveStatic `precompressed`), so the words reach a phone as small as Brotli can make them, not as small as the host's
// proxy has time for on the way out, and a local production server sends what live sends, so the phone drill means the
// same thing on both. Measured (index.html): 19.5 KB from the proxy on live, against 17 KB here.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dist = fileURLToPath(new URL("./dist", import.meta.url));
const TEXT = /\.(?:html|js|css|svg|json)$/;
// Quality 11 is a few percent smaller than 9 but takes seconds per MB, so it's kept for what a first screen can wait on;
// the big lazy chunks and the wasm take 9 (within a few percent, in seconds instead of a minute per build).
const BEST_UNDER = 600 * 1024;
const MIN_BYTES = 1024; // under this, the headers cost more than Brotli saves

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let raw = 0, br = 0, count = 0;
for (const file of walk(dist)) {
  if (!TEXT.test(file) && !file.endsWith(".wasm")) continue;
  const bytes = readFileSync(file);
  if (bytes.length < MIN_BYTES) continue;
  const small = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: bytes.length < BEST_UNDER ? 11 : 9, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } });
  writeFileSync(`${file}.br`, small);
  writeFileSync(`${file}.gz`, gzipSync(bytes, { level: 9 }));
  raw += bytes.length; br += small.length; count++;
}
console.log(`compress: ${count} files, ${(raw / 1e6).toFixed(1)} MB → br ${(br / 1e6).toFixed(1)} MB`);
