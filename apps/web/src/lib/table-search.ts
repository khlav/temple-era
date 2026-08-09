// Shared search syntax for the app's table/list filter boxes and the server-side global
// quick launcher (server/api/routers/search.ts): space-separated terms are ANDed,
// `term1|term2` is OR, `-term` excludes, `-(term1 term2)` is grouped exclusion.
//
// parseSearchQuery deliberately preserves the query's original casing/accents — the
// server builds a Postgres ILIKE condition straight from these terms, and ILIKE is
// case-insensitive but NOT accent-folding, so normalizing here would make an accented
// query stop matching the (equally accented, un-normalized) database text. Normalization
// only happens in matchesSearchQuery, at comparison time, where both the query and the
// haystack are normalized together for client-side matching.

export function normalizeSearchText(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "") // strip accents
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x00-\x7F]/g, "") // strip remaining non-ASCII
      .toLowerCase()
  );
}

interface ParsedSearchQuery {
  /** Plain terms; a row must contain every one of these. */
  positiveTerms: string[];
  /** `term1|term2` groups; a row must contain at least one term from each group. */
  orGroups: string[][];
  /** Terms a row must NOT contain (from `-term` or `-(term1 term2)`). */
  negativeTerms: string[];
}

// Matches a `-(...)` group as a single token (so it survives having internal spaces),
// otherwise falls back to a plain whitespace-delimited token.
const TOKEN_PATTERN = /-\([^)]*\)|\S+/g;

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const rawTerms = query.trim().match(TOKEN_PATTERN) ?? [];
  const positiveTerms: string[] = [];
  const orGroups: string[][] = [];
  const negativeTerms: string[] = [];

  for (const term of rawTerms) {
    if (term.startsWith("-")) {
      if (term.startsWith("-(") && term.endsWith(")")) {
        const groupTerms = term.slice(2, -1).split(/\s+/).filter(Boolean);
        negativeTerms.push(...groupTerms);
      } else if (term.length > 1) {
        negativeTerms.push(term.slice(1));
      }
    } else if (term.includes("|")) {
      const orTerms = term.split("|").filter(Boolean);
      if (orTerms.length > 0) {
        orGroups.push(orTerms);
      }
    } else {
      positiveTerms.push(term);
    }
  }

  return { positiveTerms, orGroups, negativeTerms };
}

/**
 * Matches a pre-joined searchable string (e.g. `[name, zone, class].join(" ")`)
 * against a raw user query using the syntax documented above. Handles
 * normalization of both sides, so callers can pass un-normalized text.
 */
export function matchesSearchQuery(searchableText: string, query: string): boolean {
  const { positiveTerms, orGroups, negativeTerms } = parseSearchQuery(query);
  if (positiveTerms.length === 0 && orGroups.length === 0 && negativeTerms.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText(searchableText);

  // normalizeSearchText strips all non-ASCII, so a term made up entirely of characters
  // outside its scope (CJK, Cyrillic, emoji, ...) normalizes to "" — and "".includes("")
  // is always true. Drop such terms rather than letting them silently force a match
  // (positive term) or exclude everything (negative term/OR group).
  const normalizedPositive = positiveTerms.map(normalizeSearchText).filter(Boolean);
  const normalizedNegative = negativeTerms.map(normalizeSearchText).filter(Boolean);
  const normalizedOrGroups = orGroups
    .map((group) => group.map(normalizeSearchText).filter(Boolean))
    .filter((group) => group.length > 0);

  if (normalizedNegative.some((term) => haystack.includes(term))) {
    return false;
  }
  if (!normalizedPositive.every((term) => haystack.includes(term))) {
    return false;
  }
  return normalizedOrGroups.every((group) => group.some((term) => haystack.includes(term)));
}
