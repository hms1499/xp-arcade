import { GAME_IDS, type GameId } from "./game-registry";

export const TELEMETRY_EVENTS = [
  "wallet_connect_error",
  "tx_confirmation_timeout",
  "holdings_total_failure",
] as const;

export const FUNNEL_EVENTS = [
  "game_over",
  "mint_attempted",
  "mint_confirmed",
  "mint_failed",
  "claim_attempted",
  "claim_confirmed",
  "claim_failed",
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export type AnyEvent = TelemetryEvent | FunnelEvent;

export const ALL_EVENTS: readonly string[] = [
  ...TELEMETRY_EVENTS,
  ...FUNNEL_EVENTS,
];

export function isFunnelEvent(event: string): event is FunnelEvent {
  return (FUNNEL_EVENTS as readonly string[]).includes(event);
}

type TelemetryPayload = {
  event: AnyEvent;
  message: string;
  path?: string;
  game?: GameId;
};

const ADDRESS_PATTERN = /\b(?:SP|ST)[A-Z0-9]{20,}\b/g;
const TX_PATTERN = /\b0x[a-fA-F0-9]{32,}\b/g;

export function redactSensitiveText(value: string): string {
  return value
    .replace(ADDRESS_PATTERN, "[address]")
    .replace(TX_PATTERN, "[txid]");
}

function isValidGame(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as string[]).includes(value);
}

export function sanitizeTelemetryPayload(
  value: unknown,
): TelemetryPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.event !== "string" ||
    !ALL_EVENTS.includes(input.event)
  ) {
    return null;
  }
  const event = input.event as AnyEvent;
  const game = isValidGame(input.game) ? input.game : undefined;
  // Funnel events carry a game dimension, not a free-text message.
  const message = isFunnelEvent(event)
    ? ""
    : redactSensitiveText(
        typeof input.message === "string" ? input.message : "Unknown client error",
      ).slice(0, 300);
  // Funnel events carry only event + game — no free-text path.
  const path = isFunnelEvent(event)
    ? undefined
    : typeof input.path === "string"
      ? redactSensitiveText(input.path).slice(0, 120)
      : undefined;
  return { event, message, path, game };
}

function send(body: string): void {
  if (typeof window === "undefined") return;
  if (navigator.sendBeacon?.("/api/telemetry", body)) return;
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
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
  send(JSON.stringify(payload));
}

export function trackFunnel(
  event: FunnelEvent,
  opts: { game?: GameId } = {},
): void {
  if (typeof window === "undefined") return;
  const payload = sanitizeTelemetryPayload({
    event,
    game: opts.game,
  });
  if (!payload) return;
  send(JSON.stringify(payload));
}
