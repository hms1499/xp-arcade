export const TELEMETRY_EVENTS = [
  "wallet_connect_error",
  "tx_confirmation_timeout",
  "holdings_total_failure",
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

type TelemetryPayload = {
  event: TelemetryEvent;
  message: string;
  path?: string;
};

const ADDRESS_PATTERN = /\b(?:SP|ST)[A-Z0-9]{20,}\b/g;
const TX_PATTERN = /\b0x[a-fA-F0-9]{32,}\b/g;

export function redactSensitiveText(value: string): string {
  return value
    .replace(ADDRESS_PATTERN, "[address]")
    .replace(TX_PATTERN, "[txid]");
}

export function sanitizeTelemetryPayload(
  value: unknown,
): TelemetryPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.event !== "string" ||
    !TELEMETRY_EVENTS.includes(input.event as TelemetryEvent)
  ) {
    return null;
  }
  const rawMessage =
    typeof input.message === "string" ? input.message : "Unknown client error";
  const message = redactSensitiveText(rawMessage).slice(0, 300);
  const path =
    typeof input.path === "string"
      ? redactSensitiveText(input.path).slice(0, 120)
      : undefined;
  return { event: input.event as TelemetryEvent, message, path };
}

export function reportClientError(
  event: TelemetryEvent,
  error: unknown,
): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  const payload = sanitizeTelemetryPayload({
    event,
    message,
    path: window.location.pathname,
  });
  if (!payload) return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.("/api/telemetry", body)) return;
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
