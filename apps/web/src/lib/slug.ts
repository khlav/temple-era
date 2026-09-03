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
