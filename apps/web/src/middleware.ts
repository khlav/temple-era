import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // Forward pathname as a header so layouts can read the current URL
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Block all crawling on non-production domains (Vercel previews, dev, etc.)
  const isProduction =
    host === "www.temple-era.com" || host === "temple-era.com";

  if (!isProduction) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet",
    );
    return response;
  }

  // Add noindex headers for private routes
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/raid-manager") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/api")
  ) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    // Add noindex headers
    response.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet",
    );

    return response;
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
