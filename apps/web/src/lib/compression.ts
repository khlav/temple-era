import { NextResponse } from "next/server";
import { gzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);

/**
 * Compresses a JSON response if the client supports gzip encoding.
 * Falls back to uncompressed JSON if the client doesn't support gzip.
 *
 * @param data - The data to serialize as JSON
 * @param request - The incoming request to check for Accept-Encoding header
 * @returns A NextResponse with compressed or uncompressed JSON
 */
export async function compressResponse(
  data: unknown,
  request: Request,
): Promise<NextResponse> {
  const acceptEncoding = request.headers.get("accept-encoding") || "";
  const supportsGzip = acceptEncoding.includes("gzip");

  if (!supportsGzip) {
    // Fallback to uncompressed JSON
    return NextResponse.json(data);
  }

  try {
    const jsonString = JSON.stringify(data);
    const compressed = await gzipAsync(Buffer.from(jsonString, "utf-8"));

    return new NextResponse(new Blob([new Uint8Array(compressed)]), {
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    // If compression fails, fall back to uncompressed
    console.error("Compression error, falling back to uncompressed:", error);
    return NextResponse.json(data);
  }
}
