import { type ChatInputCommandInteraction } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleSrCommand } from "../srCommand.js";
import { logger } from "../../config/logger.js";

const { USER_ID } = vi.hoisted(() => ({
  USER_ID: "999999999999999999",
}));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockCheckUserPermissions = vi.fn();
vi.mock("../../services/permissionChecker.js", () => ({
  checkUserPermissions: (...args: unknown[]) => mockCheckUserPermissions(...args),
}));

const mockGetZoneEmoji = vi.fn().mockReturnValue(undefined);
vi.mock("../../services/zoneEmoji.js", () => ({
  getZoneEmoji: (...args: unknown[]) => mockGetZoneEmoji(...args),
}));

const mockPostWeeklyTokenEntries = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/tokenThreadSummary.js", () => ({
  postWeeklyTokenEntries: (...args: unknown[]) => mockPostWeeklyTokenEntries(...args),
}));

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as Response;
}

function embedTitleAndDescription(call: unknown) {
  const { embeds } = call as { embeds: { toJSON(): { title: string; description: string } }[] };
  const data = embeds[0]!.toJSON();
  return { title: data.title, description: data.description };
}

function fakeInteraction(overrides: {
  zone?: string;
  deferReply?: ReturnType<typeof vi.fn>;
  editReply?: ReturnType<typeof vi.fn>;
  deleteReply?: ReturnType<typeof vi.fn>;
}): ChatInputCommandInteraction {
  const interaction = {
    options: { getString: () => overrides.zone ?? "mc" },
    user: { id: USER_ID },
    deferReply: overrides.deferReply ?? vi.fn().mockResolvedValue(undefined),
    editReply: overrides.editReply ?? vi.fn().mockResolvedValue(undefined),
    deleteReply: overrides.deleteReply ?? vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    client: {},
  };
  return interaction as unknown as ChatInputCommandInteraction;
}

describe("handleSrCommand", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockGetZoneEmoji.mockReturnValue(undefined);
    mockPostWeeklyTokenEntries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("defers ephemerally before doing any network work", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: false,
    });
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    const deferArg = (interaction.deferReply as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      flags: number;
    };
    expect(deferArg.flags).toBeDefined();
  });

  it("denies a user without softres:access", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: false,
    });
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "You don't have permission to create SoftRes raids.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a failed permission check as denied (fail closed)", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: false,
      hasAccount: false,
      canManageRaidLogs: false,
      canAccessSoftres: false,
      error: "network down",
    });
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "You don't have permission to create SoftRes raids.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an SR for the chosen zone, deletes the placeholder, and follows up publicly", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        zone: "Molten Core",
        adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
        publicUrl: "https://softres.it/raid/abc123",
        createdDate: "Sunday 09/13/2026",
        createdTimestamp: 1757784000,
      }),
    );
    const interaction = fakeInteraction({ zone: "mc" });

    await handleSrCommand(interaction);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/create-softres",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ zone: "mc" }),
      }),
    );
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const publicEmbed = embedTitleAndDescription(
      (interaction.followUp as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(publicEmbed.title).toBe("SRs : Molten Core");
    expect(publicEmbed.description).toBe(
      "Sunday 09/13/2026\n\nMolten Core: https://softres.it/raid/abc123",
    );

    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledWith(interaction.client, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/abc123?adminToken=tok",
        emoji: undefined,
        timestampSec: 1757784000,
      },
    ]);
  });

  it("prefixes both embeds' zone line with the zone's emoji when one is available", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    mockGetZoneEmoji.mockReturnValue("<:mc:123456789012345678>");
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        zone: "Molten Core",
        adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
        publicUrl: "https://softres.it/raid/abc123",
        createdDate: "Sunday 09/13/2026",
        createdTimestamp: 1757784000,
      }),
    );
    const interaction = fakeInteraction({ zone: "mc" });

    await handleSrCommand(interaction);

    expect(mockGetZoneEmoji).toHaveBeenCalledWith("Molten Core");
    const publicEmbed = embedTitleAndDescription(
      (interaction.followUp as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(publicEmbed.description).toBe(
      "Sunday 09/13/2026\n\n<:mc:123456789012345678> Molten Core: https://softres.it/raid/abc123",
    );
    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledWith(interaction.client, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/abc123?adminToken=tok",
        emoji: "<:mc:123456789012345678>",
        timestampSec: 1757784000,
      },
    ]);
  });

  it("edits the deferred reply and does not post to the thread when create-softres reports failure", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: "Unknown zone" }));
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
    });
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "Unknown zone" }),
      "create-softres reported failure",
    );
  });

  it("edits the deferred reply and logs on a malformed create-softres response", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: "shape" }));
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/discord/create-softres", zone: "mc" }),
      "Unexpected response shape from create-softres",
    );
  });

  it("edits the deferred reply and logs without throwing when fetch itself rejects", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockRejectedValue(new Error("network down"));
    const interaction = fakeInteraction({});

    await expect(handleSrCommand(interaction)).resolves.toBeUndefined();

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "network down" }),
      "Error creating SoftRes via /sr",
    );
  });

  it("does not attempt another reply when merging into the Token thread summary throws after the public follow-up", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        zone: "Molten Core",
        adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
        publicUrl: "https://softres.it/raid/abc123",
        createdDate: "Sunday 09/13/2026",
        createdTimestamp: 1757784000,
      }),
    );
    mockPostWeeklyTokenEntries.mockRejectedValue(new Error("thread archived"));
    const interaction = fakeInteraction({});

    await expect(handleSrCommand(interaction)).resolves.toBeUndefined();

    // The public follow-up already went out and the ephemeral placeholder was already
    // deleted — the thread-post failure must be logged, never turned into another reply.
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const publicEmbed = embedTitleAndDescription(
      (interaction.followUp as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(publicEmbed.title).toBe("SRs : Molten Core");
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "thread archived" }),
      "Error creating SoftRes via /sr",
    );
  });

  it("logs without throwing when deferReply itself rejects", async () => {
    const deferReply = vi.fn().mockRejectedValue(new Error("Unknown interaction"));
    const editReply = vi.fn().mockRejectedValue(new Error("Interaction has not been deferred"));
    const interaction = fakeInteraction({ deferReply, editReply });

    await expect(handleSrCommand(interaction)).resolves.toBeUndefined();

    expect(mockCheckUserPermissions).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "Unknown interaction" }),
      "Error creating SoftRes via /sr",
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "Interaction has not been deferred" }),
      "Failed to notify user of /sr failure",
    );
  });

  it("logs without throwing when the catch block's own editReply rejects", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockRejectedValue(new Error("network down"));
    const editReply = vi.fn().mockRejectedValue(new Error("Unknown Message"));
    const interaction = fakeInteraction({ editReply });

    await expect(handleSrCommand(interaction)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "network down" }),
      "Error creating SoftRes via /sr",
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "Unknown Message" }),
      "Failed to notify user of /sr failure",
    );
  });
});
