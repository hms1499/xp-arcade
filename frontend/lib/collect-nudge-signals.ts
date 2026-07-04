import { GAME_IDS, type GameId } from "./game-registry";
import {
  type DailyChallengeState, dailyGame, todayKey, viewStreak,
} from "./daily-challenge";
import { playerLiveRanks, type LiveRanks } from "./player-ranks";
import type { LeaderboardSnapshot } from "./leaderboard-snapshot";
import { deriveCountdown, type Countdown } from "./season-countdown";
import { blocksToEta } from "./season-blocks";
import type { NudgeKind, NudgeSignals } from "./retention-nudge";
import type { UnclaimedSummary } from "@/state/unclaimed-prizes";

export type CollectDeps = {
  address: string | null;
  dailyState: DailyChallengeState;
  shownToday: Partial<Record<NudgeKind, boolean>>;
  lastSeenRanks: LiveRanks | null;
  fetchSnapshot: () => Promise<LeaderboardSnapshot>;
  fetchTip: () => Promise<number>;
  fetchUnclaimed: () => Promise<UnclaimedSummary | null>;
  now?: number;
};

export async function collectNudgeSignals(deps: CollectDeps): Promise<NudgeSignals> {
  const now = deps.now ?? Date.now();
  const today = todayKey(new Date(now));
  const base: NudgeSignals = {
    address: deps.address,
    streak: viewStreak(deps.dailyState, today),
    dailyGame: dailyGame(today),
    ranks: null,
    lastSeenRanks: deps.lastSeenRanks,
    countdowns: {},
    shownToday: deps.shownToday,
    unclaimed: null,
  };
  if (!deps.address) return base;

  const [snap, unclaimed] = await Promise.all([
    deps.fetchSnapshot(),
    deps.fetchUnclaimed().catch(() => null),
  ]);
  const ranks = playerLiveRanks(snap, deps.address);
  // seasonEndBlock ships inside the snapshot — only ranked games with a positive
  // end block need a countdown, and the chain tip is fetched once for all of them.
  const ranked = GAME_IDS.filter(
    (g) => ranks[g] != null && (snap.games[g]?.seasonEndBlock ?? 0) > 0,
  );

  const countdowns: Partial<Record<GameId, Countdown>> = {};
  if (ranked.length > 0) {
    const tip = await deps.fetchTip();
    for (const g of ranked) {
      const endBlock = snap.games[g]!.seasonEndBlock as number;
      countdowns[g] = deriveCountdown(
        { kind: "block", reached: tip >= endBlock, endsAt: blocksToEta(endBlock, tip), endBlock },
        now,
      );
    }
  }
  return { ...base, ranks, countdowns, unclaimed };
}
