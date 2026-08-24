# syntax=docker/dockerfile:1

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

# Baked in at build time. This is a static bundle with no server of its own to
# read configuration at runtime, so the two URLs it talks to are build inputs.
# Neither is a secret: the system key is typed in by the operator and never
# leaves the browser tab.
ARG VITE_CORE_URL=http://localhost:3400
ARG VITE_KRAKEN_URL=ws://localhost:8410/ws
ENV VITE_CORE_URL=$VITE_CORE_URL
ENV VITE_KRAKEN_URL=$VITE_KRAKEN_URL

RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
# The unprivileged image listens on 8080 as a non-root user, matching core's
# stance: this is meant to be self-hosted, so it assumes nothing about the
# trust level of the host it lands on.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080

# 127.0.0.1, not localhost: localhost resolves to [::1] first in this image,
# and `listen 8080` binds IPv4 only, so the check would fail forever against a
# perfectly healthy server.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1
