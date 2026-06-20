export type NormalizedUrl =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Turn raw URL-bar input into a validated http(s) URL string.
 * Adds https:// when no scheme is present; rejects non-http(s) schemes
 * (javascript:, file:, data:, …) and unparseable input.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Empty address" };

  // Check if input already has a scheme
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "Not a valid address" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `Unsupported scheme: ${parsed.protocol}` };
  }

  // If we auto-added the scheme, validate that the original input
  // doesn't look like a broken scheme attempt (contains :// or looks malformed)
  if (!hasScheme && /[:!@#$%^&*(){}[\]<>?/\\|`~;"]/.test(trimmed)) {
    // Allow common URL chars like ? and /, but reject obvious malformation indicators
    if (/[!@#$%^&*(){}[\]<>\\|`~;"]/.test(trimmed)) {
      return { ok: false, reason: "Not a valid address" };
    }
  }

  return { ok: true, url: parsed.toString() };
}
