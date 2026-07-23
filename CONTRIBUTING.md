# Contributing to @agentix-e/entity-resolver

## Development Setup

```bash
# Prerequisites
node >= 22.0.0
pnpm >= 9.15.0

# Clone and install
git clone https://github.com/AgentiX-E/entity-resolver.git
cd entity-resolver
pnpm install

# Build all packages
pnpm build

# Run checks
pnpm ci         # lint + typecheck + test + format
pnpm test       # run tests with coverage
pnpm typecheck  # type-check only
pnpm lint       # lint only
pnpm format     # format check
```

## Monorepo Structure

```
packages/
├── entity-resolver-core/      # Stateless computation engine
├── entity-resolver-node/      # Node.js adapters
├── entity-resolver-browser/   # Browser adapters
├── entity-resolver-server/    # HTTP/gRPC/MCP API
├── entity-resolver-cli/       # CLI tool
├── entity-resolver-visual/    # Framework-agnostic visualization
└── entity-resolver/           # Umbrella facade
```

## CI Gate

Every PR and push to `master` must pass **all** checks. No `continue-on-error` or `|| true` workarounds are tolerated.

| Check | Requirement |
|-------|-------------|
| `lint` | ESLint zero errors |
| `typecheck` | `tsc --noEmit` zero errors (strict mode) |
| `test` | All tests pass + coverage meets per-package thresholds (target ≥95% all dimensions) |
| `format` | Prettier check passes |

## Code Style

- All code comments and documentation **must be in English**
- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- No `any`, no `@ts-ignore`, no `@ts-nocheck`
- Use `const` type imports: `import type { Foo } from './types.js'`
- Pure functions in core — zero side effects
- DI interface contracts in core, implementations in node/browser

## Commit Convention

- Commits must be under the name `Lambertyan`
- Standard conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## Iteration Workflow

Each iteration follows this workflow:
1. Design review (proposal → audit → approval)
2. Implementation (code + tests + docs)
3. Self-audit against acceptance criteria
4. Submit for approval
5. Merge to `master` only after passing all CI gates

## License

MIT © Lambertyan
