// Serves DuckDB WASM binaries, browser package dist, and test pages.
// Used by Playwright browser tests for real WASM initialization.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const MIME_TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
};

function resolveFile(url: string): { path: string; mime: string } | null {
  const clean = url.split('?')[0]!.replace(/^\/+/, '');
  if (!clean || clean === '/') return null;

  const ext = extname(clean).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  // Check multiple locations
  const candidates = [
    join(PROJECT_ROOT, clean), // absolute from project root
    join(__dirname, 'wasm-cache', clean), // from e2e/wasm-cache/
    join(__dirname, clean), // from e2e/
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return { path: candidate, mime };
  }

  // Try duckdb-wasm dist from pnpm store
  if (clean.startsWith('duckdb-')) {
    const duckdbDist = findDuckDBDist();
    const cand = join(duckdbDist, clean);
    if (existsSync(cand)) return { path: cand, mime };
  }

  return null;
}

function findDuckDBDist(): string {
  // Find the @duckdb/duckdb-wasm dist in pnpm store
  const pnpmDir = join(PROJECT_ROOT, 'node_modules', '.pnpm');
  try {
    const { readdirSync } = require('node:fs') as any;
    const entries = readdirSync(pnpmDir);
    for (const entry of entries) {
      if (entry.startsWith('@duckdb+duckdb-wasm@')) {
        return join(pnpmDir, entry, 'node_modules', '@duckdb', 'duckdb-wasm', 'dist');
      }
    }
  } catch {}
  return join(PROJECT_ROOT, 'node_modules', '@duckdb', 'duckdb-wasm', 'dist');
}

function serveFile(res: ServerResponse, filePath: string, mime: string): void {
  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  const resolved = resolveFile(req.url || '/');
  if (resolved) {
    serveFile(res, resolved.path, resolved.mime);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${req.url}`);
  }
});

server.listen(3001, () => {
  console.log('[wasm-server] Serving on http://localhost:3001');
  console.log(`[wasm-server] Root: ${PROJECT_ROOT}`);
});
