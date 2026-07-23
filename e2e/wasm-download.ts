// Downloads DuckDB WASM binary to local cache from CDN or pnpm store.
// Used by both local development and CI (cached via GitHub Actions).
//
// Priority:
//   1. e2e/wasm-cache/duckdb-eh.wasm (local cache, CI-cached)
//   2. node_modules/@duckdb/duckdb-wasm/dist/ (installed via pnpm)
//   3. CDN download (jsdelivr, fallback)
//
// Runs as a webServer in playwright.config.ts — the server signals
// readiness via health endpoint on port 3002 after the binary is available.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, createWriteStream, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'wasm-cache');
const WASM_FILE = join(CACHE_DIR, 'duckdb-eh.wasm');
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm';

function findPnpmWasm(): string | null {
  const pattern = join(
    __dirname,
    '..',
    'node_modules',
    '.pnpm',
    '@duckdb+duckdb-wasm*',
    'node_modules',
    '@duckdb',
    'duckdb-wasm',
    'dist',
    'duckdb-eh.wasm',
  );
  const matches = globSync(pattern);
  return matches.length > 0 ? matches[0]! : null;
}

async function ensureWasm(): Promise<string> {
  // Priority 1: Local cache
  if (existsSync(WASM_FILE)) {
    console.log(`[wasm-download] Cache hit: ${WASM_FILE}`);
    return WASM_FILE;
  }

  // Priority 2: Copy from pnpm store
  const pnpmWasm = findPnpmWasm();
  if (pnpmWasm) {
    console.log(`[wasm-download] Copying from pnpm store: ${pnpmWasm}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    copyFileSync(pnpmWasm, WASM_FILE);
    console.log(`[wasm-download] Cached to ${WASM_FILE}`);
    return WASM_FILE;
  }

  // Priority 3: CDN download
  console.log(`[wasm-download] Downloading from ${CDN_URL}...`);
  mkdirSync(CACHE_DIR, { recursive: true });

  const response = await fetch(CDN_URL);
  if (!response.ok) {
    throw new Error(`CDN download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const stream = createWriteStream(WASM_FILE);
  await new Promise<void>((resolve, reject) => {
    stream.write(buffer, (err) => {
      if (err) reject(err);
      stream.end(() => resolve());
    });
  });

  console.log(
    `[wasm-download] Downloaded (${(buffer.length / 1024 / 1024).toFixed(1)} MB) to ${WASM_FILE}`,
  );
  return WASM_FILE;
}

ensureWasm()
  .then(() => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    server.listen(3002, () => {
      console.log('[wasm-download] Ready on port 3002');
    });
  })
  .catch((err) => {
    console.error(`[wasm-download] Failed: ${err.message}`);
    process.exit(1);
  });
