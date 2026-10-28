import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/services/qstash-client", () => ({ qstashClient: {} }));

const { achievementEvaluateSchedule } =
  await import("~/server/services/achievement-evaluate-publish");

const at = (iso: string) => Date.parse(iso);

describe("achievementEvaluateSchedule", () => {
  it("gives a raid's triggers in one half-hour window the same id, delivered after it closes", () => {
    // Oct 27's 14:44 import and 14:49 bench update for the same raid.
    const importTrigger = achievementEvaluateSchedule(42, at("2026-10-27T14:44:17Z"));
    const benchTrigger = achievementEvaluateSchedule(42, at("2026-10-27T14:49:20Z"));
    expect(benchTrigger).toEqual(importTrigger);
    expect(importTrigger.notBefore).toBe(at("2026-10-27T15:02:00Z") / 1000);
  });

  it("keeps raids apart, and gives a later window its own run", () => {
    const first = achievementEvaluateSchedule(42, at("2026-10-27T14:44:17Z"));
    expect(achievementEvaluateSchedule(43, at("2026-10-27T14:44:17Z")).deduplicationId).not.toBe(
      first.deduplicationId,
    );
    const later = achievementEvaluateSchedule(42, at("2026-10-27T15:01:00Z"));
    expect(later.deduplicationId).not.toBe(first.deduplicationId);
    expect(later.notBefore).toBe(at("2026-10-27T15:32:00Z") / 1000);
  });
});
