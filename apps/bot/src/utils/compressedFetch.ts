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
    try {
      // Get the compressed body as a buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      // Decompress the buffer
      const decompressed = await gunzipAsync(buffer);
      // Create a new Response with decompressed data
      return new Response(decompressed, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      // If decompression fails, log and return original response
      console.error("Error decompressing response:", error);
      return response;
    }
  }

  // Not compressed, return as-is
  return response;
}
