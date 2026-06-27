import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function params(target: string, path: string[]) {
  return { params: Promise.resolve({ target, path }) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bitflow proxy route", () => {
  it("404s an unknown target without calling upstream", async () => {
    const fetchSpy = vi.fn<FetchFn>();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await GET(
      new Request("http://localhost/api/bitflow/evil/getAllTokensAndPools"),
      params("evil", ["getAllTokensAndPools"]),
    );

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards a GET to the sdk gateway preserving path + query", async () => {
    const fetchSpy = vi.fn<FetchFn>(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await GET(
      new Request("http://localhost/api/bitflow/sdk/getAllRoutes?tokenX=token-stx&depth=4"),
      params("sdk", ["getAllRoutes"]),
    );

    expect(res.status).toBe(200);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(
      "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev/getAllRoutes?tokenX=token-stx&depth=4",
    );
    expect(init?.method).toBe("GET");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("forwards a POST to the node upstream with its body and nested path", async () => {
    const fetchSpy = vi.fn<FetchFn>(async () =>
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(
      new Request("http://localhost/api/bitflow/node/v2/contracts/call-read/SP/abc/get-quote", {
        method: "POST",
        body: JSON.stringify({ sender: "SP", arguments: [] }),
        headers: { "Content-Type": "application/json" },
      }),
      params("node", ["v2", "contracts", "call-read", "SP", "abc", "get-quote"]),
    );

    expect(res.status).toBe(200);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(
      "https://node.bitflowapis.finance/v2/contracts/call-read/SP/abc/get-quote",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ sender: "SP", arguments: [] }));
  });

  it("returns 502 when the upstream throws", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchFn>(async () => { throw new Error("network down"); }));

    const res = await GET(
      new Request("http://localhost/api/bitflow/sdk/getAllTokensAndPools"),
      params("sdk", ["getAllTokensAndPools"]),
    );

    expect(res.status).toBe(502);
  });
});
