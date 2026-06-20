import { describe, it, expect } from "vitest";
import { checkSsrf } from "./ssrf-guard";

describe("checkSsrf", () => {
  it("allows a public https domain", () => {
    expect(checkSsrf("https://example.com/")).toEqual({ safe: true });
  });

  it("allows a public http domain", () => {
    expect(checkSsrf("http://example.com/")).toEqual({ safe: true });
  });

  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://127.5.5.5/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://printer.local/",
    "http://evil.localhost/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
  ])("blocks internal host %s", (url) => {
    expect(checkSsrf(url).safe).toBe(false);
  });

  it("allows a public IP (8.8.8.8)", () => {
    expect(checkSsrf("http://8.8.8.8/")).toEqual({ safe: true });
  });

  it("allows a public IPv6 address", () => {
    expect(checkSsrf("http://[2606:4700:4700::1111]/")).toEqual({ safe: true });
  });

  it("blocks non-http(s) schemes", () => {
    expect(checkSsrf("ftp://example.com/").safe).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(checkSsrf("not a url").safe).toBe(false);
  });
});
