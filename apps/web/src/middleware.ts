import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Add noindex headers for private routes
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/raid-manager") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/api")
  ) {
    const response = NextResponse.next();

    // Add noindex headers
    response.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet",
    );

    return response;
  }

  return NextResponse.next();
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
