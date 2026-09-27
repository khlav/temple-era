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

// One per-zone line as rendered above: an optional `<:name:id>`/`<a:name:id>` emoji prefix, the
// zone name, then the public softres.it URL. Anchored to the exact "Zone: url" shape so the date
// label line and the blank separator line (neither of which contain a softres.it URL) never match.
const LINK_LINE_REGEX = /^(?:(<a?:\w+:\d+>) )?(.+?): (https:\/\/softres\.it\/raid\/[\w.-]+)$/;

/** The raid id in a softres.it public (no-token) link, or null if the link has an unexpected
 * shape. The admin-link counterpart, `adminUrlRaidId`, lives in weekly-token-block.ts. */
export function publicUrlRaidId(url: string): string | null {
  const match = /^https:\/\/softres\.it\/raid\/([\w.-]+)$/.exec(url);
  return match ? match[1]! : null;
}

/**
 * Recovers the per-zone links from an already-posted public embed's description — the read side
 * of `buildPublicSoftresEmbedData`. Used when a SoftRes link needs to be read back off a message
 * that was posted, not built from a caller's own `SoftresEmbedLink[]` (TEMPLE-134: the dashboard
 * scanning a raid channel for a `/sr`/`POST /api/v1/softres` post that never set Raid Helper's own
 * `softresId`). Lines that don't match the expected shape are skipped rather than throwing, so an
 * unrelated line (or a future format tweak) degrades to "fewer links found", not a hard failure.
 */
export function parsePublicSoftresEmbedLinks(description: string): SoftresEmbedLink[] {
  return description.split("\n").flatMap((line): SoftresEmbedLink[] => {
    const match = LINK_LINE_REGEX.exec(line);
    if (!match) return [];
    const [, emoji, zone, url] = match;
    return [{ zone: zone!, url: url!, emoji }];
  });
}
