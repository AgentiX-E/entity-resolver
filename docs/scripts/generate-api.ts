/**
 * Unified TypeDoc API generation script.
 * Runs typedoc for each package and produces Markdown output
 * consumable by VitePress in docs/api/{pkg}/.
 *
 * Usage: pnpm docs:api
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname!, '../..');

interface PackageEntry {
  name: string;
  dir: string;
  description: string;
}

const PACKAGES: PackageEntry[] = [
  {
    name: 'core',
    dir: 'packages/entity-resolver-core',
    description: 'Stateless computation engine with WASM acceleration and DI interface contracts.',
  },
  {
    name: 'node',
    dir: 'packages/entity-resolver-node',
    description:
      'Node.js adapters — DuckDB embedded store, PostgreSQL store with mTLS, storage resolver.',
  },
  {
    name: 'browser',
    dir: 'packages/entity-resolver-browser',
    description: 'Browser adapters — DuckDB WASM store with 4-tier enterprise distribution.',
  },
  {
    name: 'server',
    dir: 'packages/entity-resolver-server',
    description:
      'Deployable HTTP/gRPC/MCP API service (stateless by default) with auth and rate limiting.',
  },
  {
    name: 'cli',
    dir: 'packages/entity-resolver-cli',
    description:
      'Command-line tool for deduplication, matching, and diagnostics with TUI renderers.',
  },
  {
    name: 'visual',
    dir: 'packages/entity-resolver-visual',
    description:
      'Framework-agnostic diagnostic components (3-layer: Data API + Headless + Web Components).',
  },
];

console.log('Generating API documentation...\n');

for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, pkg.dir);
  const typedocConfig = join(pkgDir, 'typedoc.json');
  const outDir = join(ROOT, 'docs', 'api', pkg.name);

  if (!existsSync(typedocConfig)) {
    console.warn(`  ⚠ ${pkg.name}: no typedoc.json found, skipping`);
    continue;
  }

  console.log(`  📦 ${pkg.name}...`);

  try {
    execSync(`npx typedoc --options "${typedocConfig}"`, {
      cwd: pkgDir,
      stdio: 'pipe',
    });
  } catch {
    // TypeDoc may exit 1 on warnings from tsconfig path issues in monorepo;
    // we check whether output was actually produced.
  }

  // Verify output was generated
  const indexFile = join(outDir, 'index.md');
  if (!existsSync(indexFile)) {
    console.warn(`  ⚠ ${pkg.name}: no index.md generated — may need tsconfig path fix`);
    continue;
  }

  console.log(`  ✅ ${pkg.name}`);
}

console.log('\nAPI documentation generated in docs/api/');
