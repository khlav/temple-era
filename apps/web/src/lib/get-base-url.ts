import { env } from "~/env.js";

/**
 * Get the base URL for the application
 * @param request Optional request object to extract host from headers
 * @returns The base URL (e.g., "https://www.templeashkandi.com")
 */
export function getBaseUrl(request?: Request): string {
  // Try environment variable first
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL;
  }

  // If we have a request object, try to extract from headers
  if (request) {
    const host = request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    return `${protocol}://${host}`;
  }

  // Fallback to default (should rarely be used)
  return "https://www.templeashkandi.com";
}
