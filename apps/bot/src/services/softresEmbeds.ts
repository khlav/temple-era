import { EmbedBuilder } from "discord.js";

// Discord's stock "green"/"red" swatches — green for the public link (safe to share), red for
// the admin link (carries the token, Token-thread only) so the two are visually distinct even
// without reading the content.
const PUBLIC_EMBED_COLOR = 0x57f287;
// Exported: reused by tokenThreadSummary.ts so the weekly admin-token summary stays visually
// consistent (red) with the rest of this module's SoftRes embeds.
export const ADMIN_EMBED_COLOR = 0xed4245;

export interface SoftresEmbedLink {
  zone: string;
  url: string;
  /** `<:name:id>` from zoneEmoji.ts's getZoneEmoji, or undefined if that zone has no uploaded
   *  emoji yet — the line renders as plain text in that case rather than blocking on it. */
  emoji?: string;
}

export interface SoftresEmbedOptions {
  /** Embed title, e.g. "Sunday BWL/MC @7PM : SR Link(s)". */
  title: string;
  /** Discord message URL the title links to (the original Raid-Helper signup post) — omitted
   * for `/sr`, which has no signup post to link back to. */
  titleUrl?: string;
  /** Human-readable event date/time, shown above the per-zone links. */
  dateLabel: string;
  links: SoftresEmbedLink[];
}

function buildEmbed(options: SoftresEmbedOptions, color: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(color)
    .setDescription(
      [
        options.dateLabel,
        "",
        ...options.links.map((link) => {
          const prefix = link.emoji ? `${link.emoji} ` : "";
          return `${prefix}${link.zone}: ${link.url}`;
        }),
      ].join("\n"),
    );
  if (options.titleUrl) embed.setURL(options.titleUrl);
  return embed;
}

/** Public embed: safe to post in a raid channel. Callers must pass `publicUrl`-derived links. */
export function buildPublicSoftresEmbed(options: SoftresEmbedOptions): EmbedBuilder {
  return buildEmbed(options, PUBLIC_EMBED_COLOR);
}
