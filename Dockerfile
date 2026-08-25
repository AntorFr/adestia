# Golem — a chat and apps interface on top of a coding-agent CLI.
#
# Two stages: build the workspace, then ship only what runs. The CLI itself is
# NOT baked in — a driver's binary is chosen by the operator's configuration,
# and freezing one into the image would make the engine an image property
# rather than a configuration one.

FROM node:22-slim AS build
WORKDIR /build

# Manifests first: dependencies change far less often than source, and this
# keeps the install layer cached across every code-only rebuild.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/content/package.json ./packages/content/
COPY packages/drivers/package.json ./packages/drivers/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN npm ci

COPY packages ./packages
RUN npm run build --workspace @antorfr/golem-server \
 && npm run build:web --workspace @antorfr/golem-web

# Prune to production dependencies in place, so the runtime stage copies a tree
# that is already correct rather than reinstalling and risking a different
# resolution than the one that was built and tested.
RUN npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app

# node:22-slim ships NO system CA store: /etc/ssl/certs is empty. Node bundles
# its own roots and never notices, but a driver's CLI is its own binary with
# its own TLS stack — the Copilot one dies as "request failed: builder error"
# before a single request leaves the machine, naming nothing. Since the point
# of this image is that an operator adds their CLI to it, the certificates
# belong here rather than in every derived image.
#
# `script` (util-linux, already in the base) is kept deliberately: the Copilot
# device-code login only asks whether it may store its token when it is on a
# terminal, so the driver spawns it under a pty. Do not slim it away. (Claude's
# arming needs no terminal — it speaks the OAuth exchange itself.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/packages/schemas/package.json ./packages/schemas/
COPY --from=build /build/packages/schemas/dist ./packages/schemas/dist
COPY --from=build /build/packages/content/package.json ./packages/content/
COPY --from=build /build/packages/content/dist ./packages/content/dist
COPY --from=build /build/packages/drivers/package.json ./packages/drivers/
COPY --from=build /build/packages/drivers/dist ./packages/drivers/dist
COPY --from=build /build/packages/server/package.json ./packages/server/
COPY --from=build /build/packages/server/dist ./packages/server/dist
COPY --from=build /build/packages/server/bin ./packages/server/bin
COPY --from=build /build/packages/web/package.json ./packages/web/
COPY --from=build /build/packages/web/dist-web ./packages/web/dist-web

# The extensions the product SHIPS — seven plugins and three skins, loaded by
# the same runtime path as any operator-mounted folder. Baked in because a
# default install advertising "ships with todo, collections…" and starting
# with none would be a box with a picture on it; an operator points
# GOLEM_PLUGINS_DIR/GOLEM_SKINS_DIR elsewhere to replace them entirely.
COPY plugins ./plugins
COPY skins ./skins
COPY skills ./skills

# The workspace and the data directory are the two things worth keeping across
# a container's life; both are meant to be volumes.
RUN mkdir -p /data /workspace && chown -R node:node /data /workspace
VOLUME ["/data", "/workspace"]

# Not root: the agent runs shell commands inside this container, and "the CLI
# can do anything" plus "the process is root" is a combination nobody should
# have to notice in a Dockerfile they did not read.
USER node

# Bound to every interface here, unlike the local default: inside a container
# loopback would make the port unreachable from outside it. The config's own
# default stays 127.0.0.1, where it is the right one.
ENV GOLEM_HOST=0.0.0.0
# The two volumes above ARE the defaults in here: without these, the config's
# relative `./workspace` lands on /app — read-only to the runtime user — and
# the container dies on its first mkdir. Found by running the image, not by
# reading it.
ENV GOLEM_WORKSPACE=/workspace
ENV GOLEM_DATA_DIR=/data
EXPOSE 8730

# Sizing, because it is not obvious from the image: each CONCURRENT agent turn
# spawns a CLI process costing ~300 MB of RSS (measured, spikes/concurrency).
# Give the container `baseline + maxConcurrentTurns × 300 MB`, and keep the two
# numbers in step — a generous cap behind a small limit is a burst that gets
# OOM-killed instead of politely refused.

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8730/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "packages/server/bin/golem.js"]
