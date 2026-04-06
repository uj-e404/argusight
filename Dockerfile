# Stage 1: Install dependencies
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./

# pnpm postinstall scripts crash in Docker due to a bug in pnpm's
# createLineStream (readStream must be readable). Workaround: install
# with --ignore-scripts, prebuilt binaries are already downloaded.
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild better-sqlite3

# Stage 2: Build
# --webpack flag forces Webpack compiler instead of SWC, avoiding the
# AppArmor Unix domain socket issue in Docker builds.
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node_modules/.bin/next build --webpack

# Stage 3: Runtime
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y tini wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4959

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

RUN chmod -R a+r public/ && mkdir -p config/data && chown -R node:node config

USER node

EXPOSE 4959

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4959/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "--import", "tsx", "server.ts"]
