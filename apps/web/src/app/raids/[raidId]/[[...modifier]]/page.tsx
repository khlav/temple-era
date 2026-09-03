import { RaidPageWrapper } from "~/components/raids/raid-page-wrapper";
import { auth } from "~/server/auth";
import { getRaidMetadataWithStats, generateRaidMetadata } from "~/server/metadata-helpers";
import { type Metadata } from "next";
import { cache, Suspense } from "react";
import { RaidDetailSkeleton } from "~/components/raids/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SCOPE } from "~/lib/scopes";
import { kebabCaseSlug } from "~/lib/slug";
import { db } from "~/server/db";
import { raids } from "~/server/db/schema";
import { eq } from "drizzle-orm";
// import { MetadataDebug } from "~/components/debug/metadata-debug"; // Uncomment to enable debug

const NUMERIC_ID_PATTERN = /^\d+$/;

// Cache the raid data fetch to avoid duplicate calls between generateMetadata and page component
const getCachedRaidData = cache(async (raidId: number) => {
  return await getRaidMetadataWithStats(raidId);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ raidId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = String(p.raidId);

  if (!NUMERIC_ID_PATTERN.test(raw)) {
    // Non-numeric raidId is malformed input (raids have no name-based entry point,
    // unlike characters) — skip the DB lookup rather than querying with NaN, which
    // would log a spurious Postgres error on every such request.
    return {};
  }

  const raidId = parseInt(raw);
  const raidData = await getCachedRaidData(raidId);

  const metadata = generateRaidMetadata(raidData, raidId);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: metadata.openGraph,
    alternates: {
      canonical: `/raids/${raidId}`,
    },
    other: {
      "application/ld+json": JSON.stringify(metadata.structuredData),
    },
  };
}

async function RaidPageContent({ raidId, session }: { raidId: number; session: Session | null }) {
  // Fetch raid data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const raidData = await caller.raid.getRaidById(raidId);

  // getRaidById always returns an object (spreading a possibly-undefined query result via
  // EmptyRaid()), so a plain truthiness check never catches "not found" — check the PK it
  // would have carried instead. Redirect rather than showing an inline message: a stale
  // link or hand-edited URL should land the user back on a real page, not a dead end.
  if (!raidData.raidId) {
    redirect("/raids");
  }

  // Get raid name for breadcrumb from the fetched data
  const raidName = raidData.name;
  const canViewSignupLink = !!session?.user?.scopes?.includes(SCOPE.RAIDPLAN_MANAGE);

  return (
    <>
      <RaidPageWrapper
        raidId={raidId}
        raidData={raidData}
        showEditButton={session?.user?.isRaidManager}
        canViewSignupLink={canViewSignupLink}
        initialBreadcrumbData={raidName ? { [raidId.toString()]: raidName } : {}}
      />
      {/* <MetadataDebug raidId={raidId} /> Uncomment to enable debug */}
    </>
  );
}

export default async function RaidPage({
  params,
}: {
  params: Promise<{ raidId: number; modifier?: string[] }>;
}) {
  const p = await params;
  const raw = String(p.raidId);
  const session = await auth();

  if (!NUMERIC_ID_PATTERN.test(raw)) {
    // Raids have no name-based entry point (unlike characters) — a non-numeric segment
    // is just bad input. Redirect rather than letting it reach RaidPageContent, which
    // would call getRaidById with NaN and crash on the procedure's z.number() input.
    redirect("/raids");
  }

  const raidId = parseInt(raw);
  const result = await db
    .select({ name: raids.name })
    .from(raids)
    .where(eq(raids.raidId, raidId))
    .limit(1);
  const raidName = result[0]?.name;

  if (raidName) {
    // Canonical URL is /raids/<id>/<kebab-case-name> — innocuous but descriptive. A
    // missing, stale (renamed raid), or hand-typed trailing segment gets corrected
    // here rather than just accepted, so every link to a given ID converges on the
    // same URL. Next doesn't decode dynamic segments, so decode before comparing.
    const canonicalSlug = kebabCaseSlug(raidName);
    let decodedModifier = p.modifier?.[0];
    try {
      decodedModifier =
        decodedModifier === undefined ? undefined : decodeURIComponent(decodedModifier);
    } catch {
      // Malformed percent-encoding — fall back to the raw segment rather than 500ing.
    }
    // The route is an optional catch-all, so a URL with an extra trailing segment
    // (e.g. /raids/<id>/<slug>/extra) would otherwise bypass canonicalization since
    // only the first segment gets compared — reject anything beyond a single segment too.
    if (canonicalSlug && ((p.modifier?.length ?? 0) > 1 || decodedModifier !== canonicalSlug)) {
      redirect(`/raids/${raidId}/${encodeURIComponent(canonicalSlug)}`);
    }
  }

  return (
    <Suspense fallback={<RaidDetailSkeleton />}>
      <RaidPageContent raidId={raidId} session={session} />
    </Suspense>
  );
}
