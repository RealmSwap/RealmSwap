# RealmSwap headless dashboard (Linux x86_64 / arm64).
#
# The Next server runs Electron-free (see src/lib/appPaths.ts + electron/main.js),
# so a container is a first-class deployment target: game servers run as sibling
# containers on the host daemon (docker socket mounted in), server data lives on
# a bind-mounted volume, and SQLite migrations are applied on every boot.
#
# Build:  docker build -t realmswap .
# Run:    see compose.yaml / docs/headless-docker.md

# ---- deps ------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma generates the native query engine for THIS platform (linux) — the
# runtime image runs the same architecture, so the traced/generated client works.
RUN npx prisma generate && npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# docker CLI so DockerRunner can drive the host daemon through the mounted
# socket (docker-outside-of-docker). No daemon inside this container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GAMEVAULT_DATA_DIR=/data

# Standalone output: server.js + traced node_modules.
COPY --from=build /app/.next/standalone ./
# Static assets and the generated Prisma client (custom output dir — copied
# explicitly rather than relying on output tracing).
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src/generated ./src/generated
# Boot-time schema migrations (same runner the packaged Electron app uses).
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/electron/migrate.js ./electron/migrate.js
COPY --from=build /app/scripts/migrate-on-boot.js ./scripts/migrate-on-boot.js

# Game servers, DB, backups, snapshots, secrets all live here — mount a volume.
RUN mkdir -p /data
VOLUME /data

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate-on-boot.js && node server.js"]
