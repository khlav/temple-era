/**
 * The subset of a Discord embed these modules produce, as a plain object — deliberately not
 * discord.js's `EmbedBuilder`, so `apps/web` (which talks to Discord over REST and has no
 * discord.js) and `apps/bot` can both use it. It is exactly the shape Discord's API and
 * `new EmbedBuilder(data)` accept.
 */
export interface EmbedData {
  title: string;
  description: string;
  color: number;
  url?: string;
  footer?: { text: string };
}

// Discord's stock "green"/"red" swatches — green for the public link (safe to share), red for
// the admin link (carries the token, Token-thread only) so the two are visually distinct even
// without reading the content.
export const PUBLIC_EMBED_COLOR = 0x57f287;
export const ADMIN_EMBED_COLOR = 0xed4245;

export interface SoftresEmbedLink {
  zone: string;
  url: string;
  /** `<:name:id>` for the zone, or undefined if that zone has no uploaded emoji yet — the line
   *  renders as plain text in that case rather than blocking on it. */
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

/** Public embed: safe to post in a raid channel. Callers must pass `publicUrl`-derived links. */
export function buildPublicSoftresEmbedData(options: SoftresEmbedOptions): EmbedData {
  const embed: EmbedData = {
    title: options.title,
    color: PUBLIC_EMBED_COLOR,
    description: [
      options.dateLabel,
      "",
      ...options.links.map((link) => {
        const prefix = link.emoji ? `${link.emoji} ` : "";
        return `${prefix}${link.zone}: ${link.url}`;
      }),
    ].join("\n"),
  };
  if (options.titleUrl) embed.url = options.titleUrl;
  return embed;
}
