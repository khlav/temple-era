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

  const ADMIN_URL = "https://softres.it/raid/1aKrV2Je?adminToken=3ca599";

  function mockClaimResponse(setCookieValues: string[] = []) {
    return mockCreateResponse(302, "/raid/1aKrV2Je", setCookieValues);
  }

  function mockReadBack(hardReserves: number[] | null) {
    return {
      ok: true,
      json: () => Promise.resolve({ id: "1aKrV2Je", hard_reserves: hardReserves }),
    } as unknown as Response;
  }

  /** Session GET and create POST, ahead of whatever the hard-reserve attempts need. */
  function mockCreated(createSetCookie: string[] = []) {
    return vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce(
        mockCreateResponse(302, "/raid/1aKrV2Je?adminToken=3ca599", createSetCookie),
      );
  }

  /** One successful attempt: admin-link GET, hardReserve POST, read-back showing `stored`. */
  function mockCreateFlow(stored: number[], createSetCookie: string[] = []) {
    return mockCreated(createSetCookie)
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack(stored));
  }

  it("opens the admin link with the creating session before posting", async () => {
    // SoftRes stopped treating the creating session as a manager (TEMPLE-167): without this GET
    // the hardReserve POST gets 403.
    const fetchMock = mockCreateFlow([17010]);
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [url, options] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe(ADMIN_URL);
    expect(options.redirect).toBe("manual");
    expect((options.headers as Record<string, string>).cookie).toBe(
      "XSRF-TOKEN=abc123; softres_session_v2=sess456",
    );
  });

  it("posts the full item list to the raid's hardReserve route", async () => {
    const fetchMock = mockCreateFlow([17010, 17011, 18563]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010, 17011, 18563]);

    expect(result.hardReservesApplied).toBe(true);
    const [url, options] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(url).toBe("https://softres.it/raid/1aKrV2Je/hardReserve");
    expect(options.method).toBe("POST");
    // The route replaces the whole set rather than adding to it, so the complete
    // intended list has to go in every time.
    expect(JSON.parse(options.body as string)).toEqual({ items: [17010, 17011, 18563] });
    expect(fetchMock.mock.calls[4]?.[0]).toBe("https://softres.it/api/raid/1aKrV2Je");
  });

  it("prefers a session cookie reissued by the create POST over the original", async () => {
    const fetchMock = mockCreateFlow([17010], ["softres_session_v2=rotated789; Path=/; HttpOnly"]);
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [, options] = fetchMock.mock.calls[3] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.cookie).toBe("XSRF-TOKEN=abc123; softres_session_v2=rotated789");
    expect(headers["x-xsrf-token"]).toBe("abc123");
  });

  it("uses a session cookie reissued by the admin-link GET for the POST", async () => {
    const fetchMock = mockCreated()
      .mockResolvedValueOnce(mockClaimResponse(["softres_session_v2=manager999; Path=/; HttpOnly"]))
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack([17010]));
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [, options] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect((options.headers as Record<string, string>).cookie).toBe(
      "XSRF-TOKEN=abc123; softres_session_v2=manager999",
    );
  });

  it("retries once and succeeds when the first attempt is rejected", async () => {
    const fetchMock = mockCreated()
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(403))
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack([17010]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("reports failure when the POST redirects but the items never show up", async () => {
    // SoftRes answers with redirects whether or not it applied anything, so the status alone
    // can't be trusted.
    const fetchMock = mockCreated()
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack(null))
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack([17010]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010, 17011]);

    expect(result.hardReservesApplied).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("reports a rejected hard-reserve call without throwing away the admin token", async () => {
    // 422 is what SoftRes answers when an item isn't available in the raid's instance. The SR
    // itself exists and must still be administerable, so this must not throw.
    const fetchMock = mockCreated()
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(422));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.adminUrl).toBe(ADMIN_URL);
    // Deterministic, so no retry.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries from a session cookie reissued during the first attempt", async () => {
    const fetchMock = mockCreated()
      .mockResolvedValueOnce(mockClaimResponse(["softres_session_v2=manager999; Path=/; HttpOnly"]))
      .mockResolvedValueOnce(mockHardReserveResponse(403))
      .mockResolvedValueOnce(mockClaimResponse())
      .mockResolvedValueOnce(mockHardReserveResponse(302))
      .mockResolvedValueOnce(mockReadBack([17010]));
    vi.stubGlobal("fetch", fetchMock);

    await createSoftResRaid(2, [17010]);

    const [, options] = fetchMock.mock.calls[4] as [string, RequestInit];
    expect((options.headers as Record<string, string>).cookie).toBe(
      "XSRF-TOKEN=abc123; softres_session_v2=manager999",
    );
  });

  it("reports a network failure on the hard-reserve step the same way", async () => {
    const fetchMock = mockCreated().mockRejectedValue(new Error("socket hang up"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.raidId).toBe("1aKrV2Je");
  });

  it("still returns the admin token when a reissued XSRF cookie makes the decode throw", async () => {
    // "%" alone is an invalid percent-escape, so decodeURIComponent raises URIError. The session
    // GET's own decode is guarded by nothing, but a throw there is harmless — no raid exists yet.
    // This is the reachable harmful case: the *create* response reissues a malformed XSRF, so the
    // throw lands in the hard-reserve step with the admin token already parsed and held only in
    // createSoftResRaid's locals.
    const fetchMock = mockCreated(["XSRF-TOKEN=%; Path=/"]).mockResolvedValue(mockClaimResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.adminUrl).toBe(ADMIN_URL);
  });

  it("still returns the admin token when reading the create response's cookies throws", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSessionResponse(VALID_COOKIES))
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) => (name === "location" ? "/raid/1aKrV2Je?adminToken=3ca599" : null),
          getSetCookie: () => {
            throw new TypeError("getSetCookie is not a function");
          },
        },
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, [17010]);

    expect(result.hardReservesApplied).toBe(false);
    expect(result.adminToken).toBe("3ca599");
  });

  it("skips the hard-reserve step entirely when the list is empty", async () => {
    const fetchMock = mockCreated();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSoftResRaid(2, []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.hardReservesApplied).toBe(true);
  });
});
