export type SsrfVerdict = { safe: true } | { safe: false; reason: string };

function ipv4Octets(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const first = host.split(":")[0];
  return /^f[cd]/.test(first) || /^fe[89ab]/.test(first);
}

/**
 * True when a host string is a private/loopback/link-local IP literal
 * (IPv4 or IPv6). Exported so the route can check DNS-resolved addresses.
 */
export function isBlockedIp(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  const octets = ipv4Octets(h);
  if (octets) return isPrivateIpv4(octets);
  return isBlockedIpv6(h);
}

/**
 * Decide whether `url` is safe to fetch server-side. Only http(s) public
 * hosts pass; loopback, private ranges, link-local (incl. 169.254.169.254
 * cloud metadata), *.local, and IPv6 loopback are blocked. Pure, so it can
 * be unit-tested without network.
 */
export function checkSsrf(url: string): SsrfVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Not a valid address" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: "Only http(s) allowed" };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { safe: false, reason: "Internal host blocked" };
  }
  if (isBlockedIp(host)) {
    return { safe: false, reason: "Internal host blocked" };
  }

  return { safe: true };
}
