import { GAME_IDS } from "./game-registry";
import {
  dailyGameKey,
  dailyKey,
  totalKey,
  utcDay,
} from "./metrics-keys";

export type EventCounts = {
  total: number;
  byDay: Record<string, number>;
  byGame: Record<string, number>;
};

export function conversionPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizeEvent(
  event: string,
  days: number,
  counts: Record<string, number>,
  now: Date = new Date(),
): EventCounts {
  const byDay: Record<string, number> = {};
  const byGame: Record<string, number> = {};
  let summedDays = 0;

  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = utcDay(d);
    const n = counts[dailyKey(event, day)] ?? 0;
    byDay[day] = n;
    summedDays += n;
    for (const game of GAME_IDS) {
      const g = counts[dailyGameKey(event, game, day)] ?? 0;
      if (g > 0) byGame[game] = (byGame[game] ?? 0) + g;
    }
  }

  const totalKeyValue = counts[totalKey(event)];
  const total = totalKeyValue != null ? totalKeyValue : summedDays;
  return { total, byDay, byGame };
}
