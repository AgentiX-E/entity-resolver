# ── Builder ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Dependencies first (cache layer)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY .npmrc .prettierrc eslint.config.js typedoc.base.json ./
RUN pnpm install --frozen-lockfile

# Source and build
COPY packages/ ./packages/
RUN pnpm --filter @agentix-e/entity-resolver-core build
RUN pnpm --filter @agentix-e/entity-resolver-node build
RUN pnpm --filter @agentix-e/entity-resolver-browser build
RUN pnpm --filter @agentix-e/entity-resolver-server build

# ── Runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup -S eruser && adduser -S eruser -G eruser
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/entity-resolver-server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/entity-resolver-core/dist ./packages/entity-resolver-core/dist
COPY --from=builder /app/packages/entity-resolver-core/package.json ./packages/entity-resolver-core/package.json

ENV NODE_ENV=production
EXPOSE 3000
USER eruser
CMD ["node", "dist/index.js"]
