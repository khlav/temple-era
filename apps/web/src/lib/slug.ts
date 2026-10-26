/**
 * Converts free text into a lowercase, hyphen-separated slug — diacritics folded,
 * anything else non-alphanumeric collapsed to a single "-", no leading/trailing "-".
 * Used for descriptive-but-decorative URL segments (e.g. `/raids/<id>/<slug>`) where
 * the ID is authoritative and the slug just needs to be readable.
 */
export function kebabCaseSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical path of a raid page: `/raids/<id>/<slug-of-name>`. The page redirects any other
 * form to this one, so a link built without the slug costs a second full render (and its
 * metadata queries) on every visit — link here instead whenever the name is at hand
 * (TEMPLE-157). Falls back to `/raids/<id>` when there is no usable name.
 */
export function raidPath(raidId: number | string | null | undefined, name?: string | null): string {
  const slug = name ? kebabCaseSlug(name) : "";
  return slug ? `/raids/${raidId}/${encodeURIComponent(slug)}` : `/raids/${raidId}`;
}
