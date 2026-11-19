import { NextResponse } from "next/server";

/**
 * Public liveness probe, and the freshness signal the post-deploy smoke test needs.
 *
 * A smoke test that hits `www.temple-era.com` cannot otherwise tell the new build from the one
 * it replaced: the production alias moves a moment after the deploy reports success, so a check
 * run too early passes against the *previous* build and proves nothing about the one that just
 * shipped. `commit` closes that — the test polls here until it sees the SHA it deployed, and only
 * then asserts anything.
 *
 * `VERCEL_GIT_COMMIT_SHA` is a Vercel system environment variable, not app config, so it is read
 * straight from `process.env` rather than going through `~/env` and Doppler. It is absent
 * locally, which is why `commit` is nullable.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? "local",
  });
}
