/**
 * Shared helpers for raid plan routers.
 */

/**
 * Generate a URL-safe slug from an encounter name.
 * Lowercases, replaces non-alphanumeric runs with hyphens,
 * and strips leading/trailing hyphens.
 */
export function slugifyEncounterName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
