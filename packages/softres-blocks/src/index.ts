/**
 * `@temple-era/softres-blocks` — the pure logic behind the SoftRes Discord posts: the public SR
 * embed and the weekly "SR Admin Tokens" block.
 *
 * Shared because BOTH apps write to the same Discord message — the bot from `/sr` and the
 * automatic flow, the web app from Templar's create-SR endpoint — and they edit it by parsing the
 * text the other one rendered. One implementation means the format cannot drift between them.
 *
 * Deliberately transport-free: no discord.js, no fetch. Each app owns how it reads and writes
 * Discord; this package only decides what the embeds say.
 *
 * COMPILED to `dist/` like the other shared packages — see the root AGENTS.md.
 */
export * from "./embeds.js";
export * from "./lockout-week.js";
export * from "./weekly-token-block.js";
export * from "./zone-emoji-names.js";
