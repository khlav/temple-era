# Implementation Spec: Achievement Engine - Phase 4

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

A new QStash route, `api/qstash/achievement-evaluate`, following the exact structure of the existing `raid-helper-discovery`/`raid-helper-capture` routes: `verifyQstashRequest` for signature verification, `export const maxDuration = 60`, a `POST` handler, and a summary JSON response. The one design decision this phase actually has to make — and the reason it's its own phase rather than a one-line addition to Phase 2 — is **where it gets published from**.

The naive design (publish once, from `mutateInsertRaidLogWithAttendees`) is wrong: Consistency and Flexibility need `raidSignupSnapshotLinks`, which doesn't exist yet at that point in the real flow — it's created later, by a separate, unrelated request (`runPostRaidCreationSignupLinking` inside `POST /api/v1/raids`). So this phase publishes from **two** call sites instead of one. Because `evaluateAchievementsForFamily` (Phase 2) is idempotent by construction (`onConflictDoNothing` on the crossing-unique index), firing twice for the same raid is free — no correlation or deduplication logic is needed between the two triggers.

## Decisions Considered and Rejected

_Carried from the contract — filtered to phase-relevant entries._

- **QStash message published after `mutateInsertRaidLogWithAttendees` succeeds, scoped to that raid's attendees** — rejected: Periodic full-roster nightly QStash schedule. Fires precisely when new data could cause a crossing, reuses the existing discovery/capture pattern, avoids up-to-a-day lag.
- **Achievement evaluation fires from two hook points — after `mutateInsertRaidLogWithAttendees` succeeds, AND again after `runPostRaidCreationSignupLinking` resolves in `POST /api/v1/raids`** — rejected: a single hook on `mutateInsertRaidLogWithAttendees` only. Hidden-dependency critic finding: Consistency/Flexibility depend on `raidSignupSnapshotLinks`, created later by a separate, unrelated request; evaluation is already idempotent so firing twice is safe and simpler than guaranteeing one exact ordering.

## Feedback Strategy

**Inner-loop command**: `pnpm --filter temple-era-web vitest run src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts`

**Playground**: Vitest with the DB-mock pattern, following the (unread but path-confirmed) `apps/web/src/app/api/v1/raids/__tests__/route.test.ts` for how this codebase tests a route handler outside tRPC's context.

**Why this approach**: This phase is almost entirely wiring (two publish call sites + one route), so the fast loop is a scoped test asserting signature rejection and the evaluation call actually firing — no UI, no visual judgment needed.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/web/src/app/api/qstash/achievement-evaluate/route.ts` | Signature-verified route: resolves a raid's attendees to families, calls `evaluateAchievementsForFamily` for each |
| `apps/web/src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts` | Unsigned-request rejection, scoped-evaluation-only test |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/server/api/routers/raidlog.ts` | After `mutateInsertRaidLogWithAttendees`'s existing `reactivateFamiliesAfterRaid` call (~line 155), publish an achievement-evaluate message scoped to `input.raidLogId`'s raid |
| `apps/web/src/app/api/v1/raids/route.ts` | After `await runPostRaidCreationSignupLinking(result.raidId)` (line 124), publish a second achievement-evaluate message for the same `raidId` |

## Implementation Details

### achievement-evaluate route

**Pattern to follow**: `apps/web/src/app/api/qstash/raid-helper-capture/route.ts` (signature verification + `JSON.parse(verification.body)`, since `.text()` already consumed the request body during verification)

**Overview**: Given `{ raidId, trigger }`, resolves the raid's attendee `characterId`s to their `primaryCharacterId`s (deduped — a raid can have multiple characters from the same family attending), and runs Phase 2's orchestrator for each.

```typescript
export const maxDuration = 60;

interface AchievementEvaluateBody {
  raidId: number;
  trigger: "raid_log_import" | "signup_link_resolved";
}
function isAchievementEvaluateBody(value: unknown): value is AchievementEvaluateBody { /* type guard, mirrors capture route's validation */ }

export async function POST(request: Request) {
  const verification = await verifyQstashRequest(request);
  if (!verification.valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const parsed = JSON.parse(verification.body);
  if (!isAchievementEvaluateBody(parsed)) return NextResponse.json({ error: "malformed body" }, { status: 400 });

  const attendeeCharacterIds = await getAttendeeCharacterIdsForRaid(db, parsed.raidId);
  const primaryCharacterIds = await resolveToPrimaryCharacterIds(db, attendeeCharacterIds); // dedupes within the same family

  let newAwardsTotal = 0;
  for (const primaryCharacterId of primaryCharacterIds) {
    const { newAwards } = await evaluateAchievementsForFamily(db, primaryCharacterId, new Date());
    newAwardsTotal += newAwards.length;
  }
  return NextResponse.json({ raidId: parsed.raidId, trigger: parsed.trigger, familiesEvaluated: primaryCharacterIds.length, newAwards: newAwardsTotal });
}
```

**Key decisions**:

- The route evaluates only the triggering raid's attendees, never a full-roster sweep — matches the contract's exact wording for this criterion and keeps each invocation fast and scoped, same reasoning as the existing discovery/capture routes' per-event scoping.
- One family's evaluation failure (e.g., a malformed signup snapshot Phase 2 already names as a failure mode) should not abort the loop for the rest of that raid's attendees — wrap each `evaluateAchievementsForFamily` call in its own try/catch, log, and continue, then reflect any failures in the response summary rather than throwing.

**Implementation steps**:

1. Write the route following the pattern above.
2. Write `getAttendeeCharacterIdsForRaid` and `resolveToPrimaryCharacterIds` (small helpers — either inline in the route or a shared service function, whichever this codebase's convention favors for a route this size; `raid-helper-capture/route.ts`'s size is the closest reference point).

**Feedback loop**:

- **Playground**: `route.test.ts` with the DB-mock pattern.
- **Experiment**: unsigned request (expect 401, no DB calls made); valid signed request for a raid with 3 attendees across 2 families (expect exactly 2 `evaluateAchievementsForFamily` calls, not 3); a raid with one family evaluation throwing (expect the other family's evaluation still runs, and the response reflects a partial failure rather than a 500).
- **Check command**: `pnpm --filter temple-era-web vitest run src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts`

### Publish call site 1: after raid log import

**Pattern to follow**: `raid-helper-discovery/route.ts`'s `qstashClient.publishJSON(...)` call (lines 216-235) — same `qstashClient` singleton, same `new URL(path, env.NEXT_PUBLIC_APP_URL).toString()` URL-building pattern.

**Implementation steps**:

1. In `raidlog.ts`, immediately after the existing `reactivateFamiliesAfterRaid` call inside `mutateInsertRaidLogWithAttendees` (before the function returns), add:
   ```typescript
   await qstashClient.publishJSON({
     url: new URL("/api/qstash/achievement-evaluate", env.NEXT_PUBLIC_APP_URL).toString(),
     body: { raidId: input.raidId, trigger: "raid_log_import" },
   });
   ```
2. This call should not block or fail the raid-log insert itself if QStash publishing errors — wrap in the same "log and continue" pattern `runPostRaidCreationSignupLinking` already uses for its own Templar-contract-driven "must not throw" requirement, or confirm whether `mutateInsertRaidLogWithAttendees`'s existing callers can tolerate a thrown publish error (see Open Items).

### Publish call site 2: after signup-link resolution

**Implementation steps**:

1. In `apps/web/src/app/api/v1/raids/route.ts`, immediately after `await runPostRaidCreationSignupLinking(result.raidId);` (line 124), add the same publish call with `trigger: "signup_link_resolved"` instead.
2. This route is Templar-frozen (`AGENTS.md`'s "Hard constraint: Templar" — must not throw, must not alter the response). The publish call must follow the same non-throwing discipline `runPostRaidCreationSignupLinking` itself already follows on this exact line — wrap in try/catch, log on failure, never let it affect `NextResponse.json(result, { status: 201 })`.

## API Design

### New Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/qstash/achievement-evaluate` | QStash-invoked only (signature-verified); evaluates one raid's attendee families' achievements |

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `apps/web/src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts` | Signature rejection, scoped-to-raid evaluation, per-family failure isolation |

**Key test cases**:

- Missing/invalid `upstash-signature` header → `401`, no evaluation attempted.
- Valid signed request → evaluates exactly the triggering raid's distinct families, not a broader roster.
- Malformed body (missing `raidId`) → `400`, no evaluation attempted.
- One family's evaluation throwing does not prevent another family's evaluation in the same request from completing.

### Manual Testing

- [ ] Import a real raid log, confirm the achievement-evaluate message is published (check QStash dashboard or logs) and a matching family's manually-pre-seeded near-threshold achievement crosses.
- [ ] Create a raid via `POST /api/v1/raids` for an event with real Raid Helper signups, confirm the second publish fires after signup linking and a Consistency/Flexibility achievement crosses where it couldn't have from the first trigger alone.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Publish call site 1 | QStash publish fails (network, misconfigured signing key) | Transient QStash outage | Raid log import itself must still succeed — this is a fire-and-forget side effect, not a core write | Wrap in try/catch, log, never propagate to the caller of `mutateInsertRaidLogWithAttendees` |
| Publish call site 2 | Same, inside the Templar-frozen route | Same | Must not alter the 201 response per the Templar constraint | Same try/catch discipline as `runPostRaidCreationSignupLinking` itself already follows on the adjacent line |
| Route | Both triggers fire for the same raid in quick succession | Normal operation — raid-log import and signup linking both happen for most raids | Evaluation runs twice for the same families | Acceptable by design — `evaluateAchievementsForFamily`'s idempotency (Phase 2) makes the second run a guaranteed no-op |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web vitest run src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts
pnpm --filter temple-era-web build
```

## Rollout Considerations

- **Feature flag**: none.
- **Monitoring**: watch the route's response `newAwards` totals and any logged per-family evaluation failures once live traffic starts flowing through it.
- **Rollback plan**: the two publish call sites are additive try/catch-wrapped side effects — removing them (or the route) doesn't affect raid-log import or raid creation's own correctness.

## Open Items

- [ ] Confirm whether `mutateInsertRaidLogWithAttendees`'s existing callers (the tRPC mutation wrapping it) can tolerate a thrown error from the new publish call, or whether it needs the same explicit try/catch-and-log discipline `runPostRaidCreationSignupLinking` already uses — default to try/catch-and-log to be safe either way.
- [ ] Confirm the exact helper/query shape for "attendee `characterId`s for a raid" — likely a straightforward `raidLogAttendeeMap` query, but not directly confirmed against `raidlog.ts`'s full schema this pass.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
