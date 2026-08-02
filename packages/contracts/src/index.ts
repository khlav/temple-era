/**
 * `@temple-era/contracts` — the `/api/discord/*` wire contract, shared by the web app that
 * serves it (`apps/web`) and the bot that calls it (`apps/bot`).
 *
 * This package is COMPILED to `dist/` rather than consumed as raw TypeScript. `apps/web` builds
 * with `moduleResolution: Bundler` and emits nothing; `apps/bot` builds with `Node16` and emits
 * only `src/`. A raw-source package would work for the first and silently break the second at
 * runtime. See the root AGENTS.md and docs/monorepo-migration-plan.md (R3).
 */
export * from "./discord/common.js";
export * from "./discord/check-permissions.js";
export * from "./discord/create-raid.js";
export * from "./discord/update-raid.js";
export * from "./discord/update-bench.js";
export * from "./discord/proxy.js";
