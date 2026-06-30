"use client";
import { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@/state/wallet";
import { usePlayXp } from "@/state/play-xp";
import { useDailyChallenge } from "@/state/daily-challenge";
import { useToasts } from "@/state/toasts";
import { useLevelProgress } from "@/state/level-progress";
import { computeLevel } from "@/lib/level";
import { levelUpStep } from "@/lib/level-up";
import { useConnectedPlayerStats } from "./useConnectedPlayerStats";

/**
 * Watch the connected wallet's true level (base + play + streak) and push a
 * balloon toast when it rises live during the session. Baselines silently on the
 * first observation per address so XP earned while away is never announced, and
 * acts only once base stats have loaded so the number is never wrong-low. The
 * transition itself lives in the pure levelUpStep; this hook is just wiring.
 */
export function useLevelUpToast(): void {
  const address = useWallet((s) => s.address);
  const { stats } = useConnectedPlayerStats();
  const playXp = usePlayXp((s) => s.lifetimeXp);
  const bestStreak = useDailyChallenge((s) => s.bestStreak);
  const hydrateDaily = useDailyChallenge((s) => s.hydrate);
  const baselinedFor = useRef<string | null>(null);

  // daily-challenge is not a persist store; hydrate once so bestStreak is real
  // before we baseline (this runs before the async stats fetch resolves).
  useEffect(() => {
    hydrateDaily();
  }, [hydrateDaily]);

  const level = useMemo(
    () => (stats ? computeLevel(stats, { playXp, bestStreak }).level : null),
    [stats, playXp, bestStreak],
  );

  useEffect(() => {
    if (!address || level === null) return;
    // Read ack via getState (not a reactive selector): this effect writes ack
    // itself and must not re-fire on its own write.
    const ack = useLevelProgress.getState().acknowledged[address] ?? 0;
    const step = levelUpStep({
      baselined: baselinedFor.current === address,
      ack,
      level,
    });
    baselinedFor.current = address;
    if (step.toast) useToasts.getState().push(step.toast);
    useLevelProgress.getState().acknowledge(address, step.ack);
  }, [address, level]);
}
