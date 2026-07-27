/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  eslint: {
    // ESLint removed in favour of oxlint (runs via lefthook, not next build)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // tsc runs in the pre-push hook; skipping the redundant Vercel check saves ~26s
    ignoreBuildErrors: !!process.env.VERCEL,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"],
  },
  async redirects() {
    return [
      {
        source: "/players/:id",
        destination: "/characters/:id",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/e/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/e/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/e/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default config;

// next.config.js
