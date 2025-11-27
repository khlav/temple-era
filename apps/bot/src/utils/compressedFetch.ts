import { gunzip } from "zlib";
import { promisify } from "util";

const gunzipAsync = promisify(gunzip);

/**
 * Fetch wrapper that automatically handles gzip compression/decompression.
 * Adds Accept-Encoding: gzip header and decompresses responses if needed.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (same as standard fetch)
 * @returns A Response object with decompressed body if it was compressed
 */
export async function compressedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // Add Accept-Encoding header to request
  const headers = new Headers(options?.headers);
  headers.set("Accept-Encoding", "gzip");

  // Make the fetch request
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Check if response is compressed
  const contentEncoding = response.headers.get("content-encoding");

  if (contentEncoding === "gzip") {
    // Get the body as a buffer first (before trying to decompress)
    const buffer = Buffer.from(await response.arrayBuffer());

    try {
      // Try to decompress the buffer
      const decompressed = await gunzipAsync(buffer);
      // Create a new Response with decompressed data
      // Remove content-encoding header since we've decompressed
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding");
      return new Response(decompressed, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      // If decompression fails, the body might not actually be compressed
      // Use the buffer as-is (it might be uncompressed JSON)
      // Remove content-encoding header since we're treating it as uncompressed
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding");
      console.error(
        "Error decompressing response, treating as uncompressed:",
        error
      );
      return new Response(buffer, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
  }

  // Not compressed, return as-is
  return response;
}
