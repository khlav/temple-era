import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoftResRaid } from "~/server/api/softres-client";

function mockSessionResponse(setCookieValues: string[]) {
  return {
    headers: {
      getSetCookie: () => setCookieValues,
    },
  } as unknown as Response;
}

function mockCreateResponse(
  status: number,
  location: string | null,
  setCookieValues: string[] = [],
) {
  return {
    status,
    headers: {
      get: (name: string) => (name === "location" ? location : null),
      getSetCookie: () => setCookieValues,
    },
  } as unknown as Response;
}

function mockHardReserveResponse(status: number) {
  return { status } as unknown as Response;
}

const VALID_COOKIES = [
  "XSRF-TOKEN=abc123; Path=/; Secure",
  "softres_session_v2=sess456; Path=/; HttpOnly; Secure",
];

describe("createSoftResRaid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a raid and parses the admin link from the redirect Location header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(302, "/raid/1aKrV2Je?adminToken=3ca599"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2);

    expect(result).toEqual({
      raidId: "1aKrV2Je",
      adminToken: "3ca599",
      adminUrl: "https://softres.it/raid/1aKrV2Je?adminToken=3ca599",
      publicUrl: "https://softres.it/raid/1aKrV2Je",
      hardReservesApplied: true,
    });
    // No hard reserves requested — no second POST, and nothing to have failed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves an already-absolute Location header without doubling the origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(
        mockCreateResponse(302, "https://softres.it/raid/1aKrV2Je?adminToken=3ca599"),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2);

    expect(result.adminUrl).toBe("https://softres.it/raid/1aKrV2Je?adminToken=3ca599");
  });

  it("sends the instance id and default settings in the POST body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(302, "/raid/1aKrV2Je?adminToken=3ca599"));
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(7);

    const createCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const [url, options] = createCall;
    expect(url).toBe("https://softres.it/raid");
    expect(options.redirect).toBe("manual");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.instances).toEqual([7]);
    expect(body.edition).toBe("classic");
    expect(body.reserve_limit).toBe(2);
  });

  it("throws when the session GET returns no cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockSessionResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSoftResRaid(1)).rejects.toThrow(/Failed to establish a SoftRes session/);
  });

  it("throws when the session GET is missing the session cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(["XSRF-TOKEN=abc123; Path=/; Secure"]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSoftResRaid(1)).rejects.toThrow(/Failed to establish a SoftRes session/);
  });

  it("throws when the create POST returns no redirect Location", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(200, null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSoftResRaid(1)).rejects.toThrow(/did not return a redirect/);
  });

  it("throws when the Location header doesn't match the expected admin-link shape", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(302, "/unexpected/path"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSoftResRaid(1)).rejects.toThrow(/Could not parse SoftRes admin link/);
  });

  it("never includes the query string (a possible adminToken) in the parse-failure error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(302, "/raid/abc123?admintoken=leaked-secret"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSoftResRaid(1)).rejects.toThrow(
      /^Could not parse SoftRes admin link from redirect: \/raid\/abc123$/,
    );
  });
});

describe("createSoftResRaid hard reserves", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockCreateFlow(hardReserveStatus: number, createSetCookie: string[] = []) {
    return vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(
        mockCreateResponse(302, "/raid/1aKrV2Je?adminToken=3ca599", createSetCookie),
      )
      .mockResolvedValueOnce(mockHardReserveResponse(hardReserveStatus));
  }

  it("posts the full item list to the raid's hardReserve route", async () => {
    const fetchMock = mockCreateFlow(302);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010, 17011, 18563]);

    expect(result.hardReservesApplied).toBe(true);
    const [url, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe("https://softres.it/raid/1aKrV2Je/hardReserve");
    expect(options.method).toBe("POST");
    // The route replaces the whole set rather than adding to it, so the complete
    // intended list has to go in every time.
    expect(JSON.parse(options.body as string)).toEqual({ items: [17010, 17011, 18563] });
  });

  it("carries the creating session's cookies, since that session already manages the raid", async () => {
    const fetchMock = mockCreateFlow(302);
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.cookie).toBe("XSRF-TOKEN=abc123; softres_session_v2=sess456");
    expect(headers["x-xsrf-token"]).toBe("abc123");
  });

  it("prefers a session cookie reissued by the create POST over the original", async () => {
    const fetchMock = mockCreateFlow(302, ["softres_session_v2=rotated789; Path=/; HttpOnly"]);
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.cookie).toBe("XSRF-TOKEN=abc123; softres_session_v2=rotated789");
  });

  it("reports a rejected hard-reserve call without throwing away the admin token", async () => {
    // 422 is what SoftRes answers when an item isn't available in the raid's instance. The SR
    // itself exists and must still be administerable, so this must not throw.
    const fetchMock = mockCreateFlow(422);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.adminUrl).toBe("https://softres.it/raid/1aKrV2Je?adminToken=3ca599");
  });

  it("reports a network failure on the hard-reserve call the same way", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(mockCreateResponse(302, "/raid/1aKrV2Je?adminToken=3ca599"))
      .mockRejectedValueOnce(new Error("socket hang up"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.raidId).toBe("1aKrV2Je");
  });

  it("skips the second request entirely when the list is empty", async () => {
    const fetchMock = mockCreateFlow(302);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.hardReservesApplied).toBe(true);
  });
});
