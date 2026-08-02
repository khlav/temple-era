/**
 * Warcraft Logs URL and report-ID parsing.
 *
 * This module is the single definition of what counts as a WCL report link. It replaces
 * three copies that had drifted apart — see the package README for the divergences and
 * why each was resolved the way it was.
 */

/** Report codes are exactly 16 alphanumeric characters. */
const REPORT_ID = "[a-zA-Z0-9]{16}";

/**
 * `(?![a-zA-Z0-9])` is load-bearing. Without it a 17-character code matches its first 16
 * characters, and the caller gets a syntactically valid report ID that does not exist —
 * apps/bot would then create a raid against it. A malformed link must yield nothing, not
 * a confident wrong answer.
 *
 * The optional `(?:vanilla|classic|www)\.` group accepts every host the site serves reports
 * on, including the bare domain. apps/bot already did this; apps/web did not, and silently
 * ignored logs posted as `www.` or bare.
 *
 * The trailing `[^\s]*` is bounded on purpose. The previous web-side regex ended in `.*`,
 * which is greedy to end-of-line, so a match span included every word typed after the link.
 * That is invisible when the URL is rebuilt from the capture group, but the UI highlights
 * links using the raw match — see apps/web/src/components/raids/discord-warcraft-logs.tsx.
 */
const WCL_URL_SOURCE = `https?://(?:(?:vanilla|classic|www)\\.)?warcraftlogs\\.com/reports/(${REPORT_ID})(?![a-zA-Z0-9])(?:[?#][^\\s]*)?`;

/** The host every extracted URL is normalised to. */
export const WCL_CANONICAL_HOST = "vanilla.warcraftlogs.com";

/**
 * Build a fresh global regex matching a WCL report URL, capturing the report ID in group 1.
 *
 * Always returns a new object. A shared `/g` regex carries `lastIndex` between calls, so a
 * second caller starts mid-string and misses matches the first caller already consumed.
 *
 * Use this only when the match span or offset is needed — for the URLs themselves prefer
 * {@link extractWarcraftLogsUrls}, which also normalises the host.
 */
export function createWclUrlRegex(): RegExp {
  return new RegExp(WCL_URL_SOURCE, "g");
}

/** Build the canonical URL for a report ID. */
export function buildReportUrl(reportId: string): string {
  return `https://${WCL_CANONICAL_HOST}/reports/${reportId}`;
}

/**
 * Extract every WCL report URL from a block of text, normalised to the canonical host with
 * query strings and fragments stripped.
 *
 * Order is preserved and duplicates are kept: apps/bot reads only the first URL, and apps/web
 * emits one record per URL found.
 */
export function extractWarcraftLogsUrls(content: string): string[] {
  const regex = createWclUrlRegex();
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const reportId = match[1];
    if (reportId) {
      urls.push(buildReportUrl(reportId));
    }
  }

  return urls;
}

/**
 * Extract the first report ID from a URL, or `null` if it contains none.
 *
 * Only the `/reports/<id>` path segment is checked — callers pass URLs already known to be
 * WCL links. Use {@link extractWarcraftLogsUrls} to validate the host as well.
 */
export function extractReportId(wclUrl: string): string | null {
  const match = new RegExp(`/reports/(${REPORT_ID})(?![a-zA-Z0-9])`).exec(wclUrl);
  return match?.[1] ?? null;
}
