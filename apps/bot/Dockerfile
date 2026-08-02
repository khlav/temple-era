# Discord bot image.
#
# Filters here are PATH-based ("./apps/bot") rather than by package name, so a
# package rename cannot silently break this build. That matters because
# `pnpm --filter <unknown-name>` prints a warning and exits 0 — it does not fail,
# so a stale name would produce a green build that quietly did nothing.
#
# IMPORTANT: the build context is the REPO ROOT, not this directory:
#
#   docker build -f apps/bot/Dockerfile -t temple-bot .
#
# The workspace manifest and lockfile live at the root, so a context of
# apps/bot/ cannot resolve the install. Northflank must be configured with
# build context "/" and Dockerfile path "/apps/bot/Dockerfile".

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- dependencies
# Copy only manifests first so this layer caches until a dependency changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json apps/bot/
# apps/web's manifest is required: pnpm validates the whole workspace against
# the lockfile even when installing a filtered subset.
COPY apps/web/package.json apps/web/
# One line per shared package. A glob cannot be used: COPY flattens matches into the
# destination directory, so `COPY packages/*/package.json packages/` would collide.
COPY packages/contracts/package.json packages/contracts/
COPY packages/wcl/package.json packages/wcl/

# --ignore-scripts: the ROOT package.json runs "prepare": "lefthook install",
# which would fail here — .git is excluded by .dockerignore and lefthook is not
# part of a filtered production install. None of the bot's runtime dependencies
# (discord.js, pino, node-cron, dotenv) have meaningful install scripts.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "{./apps/bot}..."

# ---------------------------------------------------------------------- build
FROM deps AS build
COPY apps/bot apps/bot
COPY packages packages
# The "..." suffix means "and everything it depends on", so shared packages are compiled to
# dist/ first. Without it the bot would build against a workspace package with no output.
#
# The BRACES are load-bearing. A directory filter only takes the "..." suffix in the
# `{<dir>}...` form: `"./apps/bot..."` parses as a plain path, silently selects the bot alone,
# and leaves packages/*/dist missing.
RUN pnpm --filter "{./apps/bot}..." build

# Collect the bot plus only its production dependencies into a standalone tree.
# pnpm 9 semantics: `deploy` changed in pnpm 10 and needs --legacy there, which
# is why packageManager is pinned to pnpm@9.15.1 at the root.
#
# --ignore-scripts again, and it is easy to miss here: `deploy` performs its own
# install into /out, which re-triggers the root "prepare": "lefthook install".
# git is not present in this image, so lefthook exits non-zero and fails the
# build. Guarding only the earlier install step is not enough.
RUN pnpm deploy --filter "./apps/bot" --prod --ignore-scripts /out

# --------------------------------------------------------------------- runtime
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /out /app
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 \
 && chown -R nodejs:nodejs /app
USER nodejs

# The bot is a Discord gateway client: it holds an outbound WebSocket and
# serves no inbound traffic, so no port is exposed and there is no HTTP health
# check to hit. Northflank restarts it if the process exits.
CMD ["node", "dist/index.js"]
