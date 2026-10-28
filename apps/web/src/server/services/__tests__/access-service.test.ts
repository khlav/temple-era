import { afterEach, describe, expect, it, vi } from "vitest";

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

const env = { SUPERADMIN_DISCORD_IDS: [] as string[] };
vi.mock("~/env", () => ({ env }));

// resolveUserAccess makes two reads: the user's role scopes (select → from → innerJoin → where)
// and their Discord account (select → from → where → limit).
let roleRows: { scopes: string[] }[] = [];
let accountRows: { discordId: string }[] = [];
vi.mock("~/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: async () => roleRows }),
        where: () => ({ limit: async () => accountRows }),
      }),
    }),
  },
}));

const { resolveUserAccess, invalidateUserAccessCache } =
  await import("~/server/services/access-service");
const { SCOPES } = await import("~/lib/scopes");

describe("resolveUserAccess", () => {
  afterEach(() => {
    roleRows = [];
    accountRows = [];
    env.SUPERADMIN_DISCORD_IDS = [];
    vi.clearAllMocks();
  });

  it("merges role scopes and derives the legacy flags", async () => {
    roleRows = [{ scopes: ["raidplan:manage"] }, { scopes: ["raidplan:manage", "softres:access"] }];
    accountRows = [{ discordId: "111" }];
    const access = await resolveUserAccess("u1");
    expect(access.scopes.sort()).toEqual(["raidplan:manage", "softres:access"]);
    expect(access).toMatchObject({ isRaidManager: true, isAdmin: false, isSuperadmin: false });
  });

  it("decides superadmin from the env on every call", async () => {
    accountRows = [{ discordId: "111" }];
    expect((await resolveUserAccess("u1")).isSuperadmin).toBe(false);
    env.SUPERADMIN_DISCORD_IDS = ["111"];
    const access = await resolveUserAccess("u1");
    expect(access.isSuperadmin).toBe(true);
    expect(access.scopes.sort()).toEqual([...SCOPES].sort());
  });

  it("is never a superadmin without a linked Discord account", async () => {
    env.SUPERADMIN_DISCORD_IDS = ["111"];
    expect((await resolveUserAccess("u1")).isSuperadmin).toBe(false);
  });
});

describe("invalidateUserAccessCache", () => {
  it("expires immediately rather than serving the stale value once more", () => {
    invalidateUserAccessCache();
    expect(mockRevalidateTag).toHaveBeenCalledWith("user-access", { expire: 0 });
  });
});
