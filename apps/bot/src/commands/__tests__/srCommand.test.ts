import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleSrCommand } from "../srCommand.js";
import { logger } from "../../config/logger.js";

const { TOKEN_THREAD_ID, USER_ID } = vi.hoisted(() => ({
  TOKEN_THREAD_ID: "333333333333333333",
  USER_ID: "999999999999999999",
}));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
    discordSoftresTokenThreadId: TOKEN_THREAD_ID,
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockCheckUserPermissions = vi.fn();
vi.mock("../../services/permissionChecker.js", () => ({
  checkUserPermissions: (...args: unknown[]) => mockCheckUserPermissions(...args),
}));

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as Response;
}

function fakeInteraction(overrides: {
  zone?: string;
  threadFetch?: ReturnType<typeof vi.fn>;
}): ChatInputCommandInteraction {
  return {
    options: { getString: () => overrides.zone ?? "mc" },
    user: { id: USER_ID },
    reply: vi.fn().mockResolvedValue(undefined),
    client: {
      channels: { fetch: overrides.threadFetch ?? vi.fn() },
    },
  } as unknown as ChatInputCommandInteraction;
}

describe("handleSrCommand", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "You don't have permission to create SoftRes raids.",
      flags: MessageFlags.Ephemeral,
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

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "You don't have permission to create SoftRes raids.",
      flags: MessageFlags.Ephemeral,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an SR for the chosen zone and replies with the link", async () => {
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
        createdDate: "Sunday 09/13/2026",
      }),
    );
    const send = vi.fn().mockResolvedValue(undefined);
    const threadFetch = vi.fn().mockResolvedValue({ isSendable: () => true, send });
    const interaction = fakeInteraction({ zone: "mc", threadFetch });

    await handleSrCommand(interaction);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/create-softres",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ zone: "mc" }),
      }),
    );
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Created a SoftRes for Molten Core: https://softres.it/raid/abc123?adminToken=tok",
    });
    expect(threadFetch).toHaveBeenCalledWith(TOKEN_THREAD_ID);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "Molten Core Sunday 09/13/2026: https://softres.it/raid/abc123?adminToken=tok",
    );
  });

  it("replies ephemerally and does not post to the thread when create-softres reports failure", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: "Unknown zone" }));
    const threadFetch = vi.fn();
    const interaction = fakeInteraction({ threadFetch });

    await handleSrCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
      flags: MessageFlags.Ephemeral,
    });
    expect(threadFetch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "Unknown zone" }),
      "create-softres reported failure",
    );
  });

  it("replies ephemerally and logs on a malformed create-softres response", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: "shape" }));
    const interaction = fakeInteraction({});

    await handleSrCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
      flags: MessageFlags.Ephemeral,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/discord/create-softres", zone: "mc" }),
      "Unexpected response shape from create-softres",
    );
  });

  it("replies ephemerally and logs without throwing when fetch itself rejects", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canManageRaidLogs: false,
      canAccessSoftres: true,
    });
    fetchMock.mockRejectedValue(new Error("network down"));
    const interaction = fakeInteraction({});

    await expect(handleSrCommand(interaction)).resolves.toBeUndefined();

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Something went wrong creating the SR.",
      flags: MessageFlags.Ephemeral,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "mc", error: "network down" }),
      "Error creating SoftRes via /sr",
    );
  });

  it("logs an error but leaves the success reply standing when the Token thread is not sendable", async () => {
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
        createdDate: "Sunday 09/13/2026",
      }),
    );
    const threadFetch = vi.fn().mockResolvedValue(null);
    const interaction = fakeInteraction({ threadFetch });

    await handleSrCommand(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: TOKEN_THREAD_ID }),
      "SoftRes Token thread channel is not fetchable or not sendable",
    );
  });
});
