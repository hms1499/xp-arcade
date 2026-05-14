// @stacks/transactions v7 cvToValue returns nested {type, value} wrappers for
// tuples/lists/responses. Recursively strip them down to plain JS values.
// Kept in a server/client-neutral module so API routes can import it too.
export function unwrap<T = unknown>(v: unknown): T {
  if (v === null || v === undefined) return v as T;
  if (Array.isArray(v)) return v.map(unwrap) as unknown as T;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("type" in o && "value" in o) return unwrap(o.value);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = unwrap(o[k]);
    return out as T;
  }
  return v as T;
}
