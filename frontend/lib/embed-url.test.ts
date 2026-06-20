import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./embed-url";

describe("normalizeUrl", () => {
  it("adds https:// to a bare domain", () => {
    expect(normalizeUrl("example.com")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  it("keeps an explicit https URL", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toEqual({
      ok: true,
      url: "https://example.com/path?q=1",
    });
  });

  it("keeps an explicit http URL", () => {
    expect(normalizeUrl("http://example.com/")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com  ")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
  });

  it("rejects an empty string", () => {
    expect(normalizeUrl("   ")).toEqual({
      ok: false,
      reason: "Empty address",
    });
  });

  it("rejects javascript: scheme", () => {
    const r = normalizeUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  it("rejects file: scheme", () => {
    const r = normalizeUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("rejects data: scheme", () => {
    const r = normalizeUrl("data:text/html,<h1>x</h1>");
    expect(r.ok).toBe(false);
  });

  it("rejects an unparseable address", () => {
    const r = normalizeUrl("ht!tp://%%%");
    expect(r.ok).toBe(false);
  });
});
