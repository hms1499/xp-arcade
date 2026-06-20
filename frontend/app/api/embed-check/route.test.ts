import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function req(url: string) {
  return new Request(`http://localhost/api/embed-check?url=${encodeURIComponent(url)}`);
}

function headersOf(map: Record<string, string>) {
  return { status: 200, headers: new Headers(map) };
}

describe("GET /api/embed-check", () => {
  it("400s when url param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/embed-check"));
    expect(res.status).toBe(400);
  });

  it("400s on an internal host (ssrf)", async () => {
    const res = await GET(req("http://127.0.0.1/"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s on a javascript: scheme", async () => {
    const res = await GET(req("javascript:alert(1)"));
    expect(res.status).toBe(400);
  });

  it("returns embeddable:false when X-Frame-Options is set", async () => {
    fetchMock.mockResolvedValue(headersOf({ "x-frame-options": "DENY" }));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });

  it("returns embeddable:false when CSP frame-ancestors excludes us", async () => {
    fetchMock.mockResolvedValue(
      headersOf({ "content-security-policy": "frame-ancestors 'none'" }),
    );
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });

  it("returns embeddable:true for clean headers", async () => {
    fetchMock.mockResolvedValue(headersOf({}));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns embeddable:false on fetch error (fail-safe)", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const res = await GET(req("https://example.com/"));
    const body = await res.json();
    expect(body.embeddable).toBe(false);
  });
});
