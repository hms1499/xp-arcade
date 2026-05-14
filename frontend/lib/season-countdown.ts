"use client";
import { useEffect, useState } from "react";

export type Countdown =
  | { state: "unset" }
  | { state: "expired"; endsAt: Date }
  | {
      state: "live";
      endsAt: Date;
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    };

function parseEnd(): Date | null {
  const iso = process.env.NEXT_PUBLIC_SEASON_END_ISO;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function useSeasonCountdown(): Countdown {
  const endsAt = parseEnd();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return { state: "unset" };
  const diffMs = endsAt.getTime() - now;
  if (diffMs <= 0) return { state: "expired", endsAt };

  const totalSec = Math.floor(diffMs / 1000);
  return {
    state: "live",
    endsAt,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

export function formatCountdown(c: Countdown): string {
  if (c.state === "unset") return "";
  if (c.state === "expired") return "Season ended — awaiting owner end-season";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (c.days > 0) return `${c.days}d ${pad(c.hours)}h ${pad(c.minutes)}m`;
  return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}
