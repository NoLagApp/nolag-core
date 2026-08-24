# syntax=docker/dockerfile:1
#
# Builds the example host, and the library it consumes.
#
# The two are built separately on purpose. The host installs @nolag/core the way
# any consumer would rather than compiling it as part of itself, so if the
# package is missing an export or a peer, the build fails here instead of
# quietly working because everything happened to be in scope.

# ── The library ────────────────────────────────────────────────────────────
FROM node:22-alpine AS lib

WORKDIR /app

# Install with the lockfile only, so this layer caches on dependency changes
# rather than on every source edit.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# ── The example host ───────────────────────────────────────────────────────
FROM node:22-alpine AS host

# Only what the package would actually publish: the manifest and dist. Its
# node_modules is deliberately absent, so the host cannot accidentally resolve
# a second copy of TypeORM or Nest through the library's devDependencies.
WORKDIR /app
COPY --from=lib /app/package.json ./
COPY --from=lib /app/dist ./dist

WORKDIR /app/example
# .npmrc carries install-links, which packs and extracts the `file:..`
# dependency rather than symlinking it. See the note in that file.
COPY example/package.json example/package-lock.json* example/.npmrc ./
RUN npm ci

COPY example/tsconfig.json example/tsconfig.build.json example/nest-cli.json ./
COPY example/src ./src

RUN npm run build && npm prune --omit=dev && npm cache clean --force

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Run unprivileged. This image is meant to be self-hosted, so it should not
# assume anything about the trust level of the host it lands on.
RUN addgroup -S nolag && adduser -S nolag -G nolag

COPY --from=host --chown=nolag:nolag /app/example/node_modules ./node_modules
COPY --from=host --chown=nolag:nolag /app/example/dist ./dist
COPY --chown=nolag:nolag example/package.json ./

USER nolag

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Shell form on purpose: the exec form does no variable expansion, so a
# hardcoded port would report unhealthy forever on any container started with a
# different PORT.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "dist/main"]
