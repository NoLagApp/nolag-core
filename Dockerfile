# syntax=docker/dockerfile:1

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install with the lockfile only, so this layer caches on dependency changes
# rather than on every source edit.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ── Production dependencies ────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Run unprivileged. This image is meant to be self-hosted, so it should not
# assume anything about the trust level of the host it lands on.
RUN addgroup -S nolag && adduser -S nolag -G nolag

COPY --from=deps  --chown=nolag:nolag /app/node_modules ./node_modules
COPY --from=builder --chown=nolag:nolag /app/dist ./dist
COPY --chown=nolag:nolag package.json ./

USER nolag

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Shell form on purpose: the exec form does no variable expansion, so a
# hardcoded port would report unhealthy forever on any container started with a
# different PORT.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT}/health" || exit 1

CMD ["node", "dist/main"]
