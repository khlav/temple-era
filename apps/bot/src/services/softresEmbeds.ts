import { EmbedBuilder } from "discord.js";
import { buildPublicSoftresEmbedData, type SoftresEmbedOptions } from "@temple-era/softres-blocks";

export type { SoftresEmbedLink, SoftresEmbedOptions } from "@temple-era/softres-blocks";

/**
 * Public embed: safe to post in a raid channel. Callers must pass `publicUrl`-derived links.
 * What the embed says lives in `@temple-era/softres-blocks` (shared with the web app's
 * Templar create-SR endpoint, so the two post identical embeds); this only wraps it in
 * discord.js's builder.
 */
export function buildPublicSoftresEmbed(options: SoftresEmbedOptions): EmbedBuilder {
  return new EmbedBuilder(buildPublicSoftresEmbedData(options));
}
