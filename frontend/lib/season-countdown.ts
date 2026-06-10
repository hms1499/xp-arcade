"use client";
import { useEffect, useState } from "react";
import { blocksToEta } from "./season-blocks";
import { getSeasonEndBlockForGame } from "./contract-calls";
import { getCurrentStacksBlockHeight } from "./stacks-api";
import type { GameId } from "./game-registry";

export type Countdown =
  | { state: "loading" }
  | { state: "unset" }
  | { state: "iso-expired"; endsAt: Date }
  | { state: "reached"; endsAt: Date; endBlock: number }
  | {
      state: "live";
      endsAt: Date;
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    };

export type CountdownSource =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "iso"; endsAt: Date }
  | { kind: "block"; reached: boolean; endsAt: Date; endBlock: number };

/** Pure state machine: resolved source + current epoch ms -> Countdown. */
export function deriveCountdown(source: CountdownSource, now: number): Countdown {
  if (source.kind === "loading") return { state: "loading" };
  if (source.kind === "none") return { state: "unset" };
  if (source.kind === "block" && source.reached) {
    return {
      state: "reached",
      endsAt: source.endsAt,
      endBlock: source.endBlock,
    };
  }

  const { endsAt } = source;
  const diffMs = endsAt.getTime() - now;
  if (diffMs <= 0) {
    // ISO fallback elapsed -> awaiting owner. A block ETA that elapsed but is
    // not yet confirmed reached on-chain stays "live" at zero until the next
    // chain refetch flips it to "reached".
    if (source.kind === "iso") return { state: "iso-expired", endsAt };
    return { state: "live", endsAt, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

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

function parseIso(): Date | null {
  const iso = process.env.NEXT_PUBLIC_SEASON_END_ISO;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function useSeasonCountdown(gameId: GameId): Countdown {
  const [source, setSource] = useState<CountdownSource>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  // Resolve this game's on-chain deadline + tip; refetch every 30s.
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const [endBlock, currentBlock] = await Promise.all([
          getSeasonEndBlockForGame(gameId),
          getCurrentStacksBlockHeight(),
        ]);
        if (cancelled) return;
        if (endBlock > 0) {
          setSource({
            kind: "block",
            reached: currentBlock >= endBlock,
            endsAt: blocksToEta(endBlock, currentBlock),
            endBlock,
          });
          return;
        }
        const iso = parseIso();
        setSource(iso ? { kind: "iso", endsAt: iso } : { kind: "none" });
      } catch {
        if (cancelled) return;
        const iso = parseIso();
        setSource(iso ? { kind: "iso", endsAt: iso } : { kind: "none" });
      }
    }
    resolve();
    const id = setInterval(resolve, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gameId]);

  // Tick the display every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return deriveCountdown(source, now);
}

export function formatCountdown(c: Countdown): string {
  if (c.state === "loading" || c.state === "unset") return "";
  if (c.state === "iso-expired") return "Season ended — awaiting owner end-season";
  if (c.state === "reached") return "Deadline reached — anyone can close the season";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (c.days > 0) return `${c.days}d ${pad(c.hours)}h ${pad(c.minutes)}m`;
  return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}
