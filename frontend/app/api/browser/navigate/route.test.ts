import { describe, it, expect, vi, beforeEach } from "vitest";

const isConfigured = vi.hoisted(() => vi.fn());
const navigateFn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browserbase", () => ({ isConfigured, navigate: navigateFn }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/browser/navigate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isConfigured.mockReset().mockReturnValue(true);
  navigateFn.mockReset();
});

describe("POST /api/browser/navigate", () => {
  it("503s when unconfigured", async () => {
    isConfigured.mockReturnValue(false);
    const res = await POST(req({ sessionId: "s1", url: "https://example.com" }));
    expect(res.status).toBe(503);
  });

  it("400s when sessionId is missing", async () => {
    const res = await POST(req({ url: "https://example.com" }));
    expect(res.status).toBe(400);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("400s when the url is junk", async () => {
    const res = await POST(req({ sessionId: "s1", url: "javascript:alert(1)" }));
    expect(res.status).toBe(400);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("navigates and returns the title", async () => {
    navigateFn.mockResolvedValue({ title: "Example" });
    const res = await POST(req({ sessionId: "s1", url: "example.com" }));
    expect(res.status).toBe(200);
    expect(navigateFn).toHaveBeenCalledWith("s1", "https://example.com/");
    expect(await res.json()).toEqual({ ok: true, title: "Example" });
  });

  it("returns ok:false when navigation throws", async () => {
    navigateFn.mockRejectedValue(new Error("nav failed"));
    const res = await POST(req({ sessionId: "s1", url: "example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "Navigation failed" });
  });
});
