# ── Builder ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Dependencies first (cache layer)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY .npmrc ./
RUN pnpm install --frozen-lockfile

# Source and build (only what's needed for server)
COPY packages/entity-resolver-core/ ./packages/entity-resolver-core/
COPY packages/entity-resolver-server/ ./packages/entity-resolver-server/
COPY packages/entity-resolver-node/ ./packages/entity-resolver-node/
COPY packages/entity-resolver-browser/ ./packages/entity-resolver-browser/
RUN pnpm --filter @agentix-e/entity-resolver-core build
RUN pnpm --filter @agentix-e/entity-resolver-node build
RUN pnpm --filter @agentix-e/entity-resolver-browser build
RUN pnpm --filter @agentix-e/entity-resolver-server build

# ── Production dependencies ──────────────────────────────────────
FROM builder AS deps
RUN pnpm --prod --filter @agentix-e/entity-resolver-server deploy /prod

# ── Runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup -S eruser && adduser -S eruser -G eruser
WORKDIR /app

# Copy production artifacts
COPY --from=deps /prod/node_modules ./node_modules
COPY --from=deps /prod/package.json ./package.json
COPY --from=builder /app/packages/entity-resolver-server/dist ./dist
COPY --from=builder /app/packages/entity-resolver-core/dist ./packages/entity-resolver-core/dist
COPY --from=builder /app/packages/entity-resolver-core/package.json ./packages/entity-resolver-core/package.json
COPY --from=builder /app/packages/entity-resolver-node/dist ./packages/entity-resolver-node/dist
COPY --from=builder /app/packages/entity-resolver-browser/dist ./packages/entity-resolver-browser/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)})"

USER eruser
CMD ["node", "dist/index.js"]
