"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { useWindows } from "@/state/window-manager";
import { useUnclaimedPrizes, type UnclaimedSummary } from "@/state/unclaimed-prizes";
import { TrayBalloon } from "./TrayBalloon";
import { collectNudgeSignals } from "@/lib/collect-nudge-signals";
import {
  type Nudge, type NudgeTarget,
  selectNudge, loadNudgeShown, markNudgeShown, shownTodayMap,
} from "@/lib/retention-nudge";
import { loadLastSeenRanks, saveLastSeenRanks } from "@/lib/last-seen-ranks";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { getCurrentStacksBlockHeight } from "@/lib/stacks-api";
import { loadDailyState, todayKey } from "@/lib/daily-challenge";

const SHOW_DELAY_MS = 3500;
const AUTO_HIDE_MS = 9000;

function walletBalloonGone(): boolean {
  return typeof sessionStorage !== "undefined"
    && sessionStorage.getItem("balloon-dismissed") === "1";
}

/** Scan (deduped in the store) and reduce store state to the nudge signal. */
export async function fetchUnclaimedSummary(address: string): Promise<UnclaimedSummary | null> {
  await useUnclaimedPrizes.getState().scan(address);
  const s = useUnclaimedPrizes.getState();
  if (s.status !== "done" || s.totalUstx <= 0 || !s.topGame) return null;
  return { totalUstx: s.totalUstx, gamesCount: s.gamesCount, topGame: s.topGame };
}

export function RetentionBalloon() {
  const address = useWallet((s) => s.address);
  const open = useWindows((s) => s.open);
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    // Never stack on top of the wallet balloon.
    if (!address && !walletBalloonGone()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const signals = await collectNudgeSignals({
          address: address ?? null,
          dailyState: loadDailyState(),
          shownToday: shownTodayMap(loadNudgeShown(), todayKey()),
          lastSeenRanks: address ? loadLastSeenRanks(address) : null,
          fetchSnapshot: fetchLeaderboardSnapshot,
          fetchTip: getCurrentStacksBlockHeight,
          fetchUnclaimed: () =>
            address ? fetchUnclaimedSummary(address) : Promise.resolve(null),
        });
        if (cancelled) return;
        const picked = selectNudge(signals);
        // Refresh the rank snapshot AFTER selecting (so we don't lose the signal).
        if (address && signals.ranks) saveLastSeenRanks(address, signals.ranks);
        if (picked) {
          markNudgeShown(picked.kind, todayKey());
          setNudge(picked);
        }
      } catch {
        /* read failed → no nudge this load */
      }
    }, SHOW_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [nudge]);

  if (!nudge) return null;

  function go(target: NudgeTarget) {
    if (target.window === "highscore") open("highscore", { initialTab: target.gameId });
    else open(`game-${target.gameId}`);
    setNudge(null);
  }

  return (
    <TrayBalloon
      icon={nudge.icon}
      title={nudge.title}
      body={nudge.body}
      ctaLabel={nudge.cta.label}
      onCta={() => go(nudge.cta.target)}
      onDismiss={() => setNudge(null)}
      ariaLabel={`Dismiss ${nudge.kind} reminder`}
    />
  );
}
