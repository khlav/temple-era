import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoftResRaid } from "~/server/api/softres-client";

function mockSessionResponse(setCookieValues: string[]) {
  return {
    headers: {
      getSetCookie: () => setCookieValues,
    },
  } as unknown as Response;
}

function mockCreateResponse(status: number, location: string | null) {
  return {
    status,
    headers: {
      get: (name: string) => (name === "location" ? location : null),
    },
  } as unknown as Response;
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
    });
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
});
