export const EVENT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function dailyKey(event: string, day: string): string {
  return `ev:${event}:${day}`;
}

export function dailyGameKey(event: string, game: string, day: string): string {
  return `ev:${event}:${game}:${day}`;
}

export function totalKey(event: string): string {
  return `ev:${event}:total`;
}

export function keysForRange(
  event: string,
  days: number,
  now: Date = new Date(),
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dailyKey(event, utcDay(d)));
  }
  return keys;
}
