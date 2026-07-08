import { type GameId } from "./game-registry";
import { useSessionStats } from "@/state/session-stats";
import { useDailyChallenge } from "@/state/daily-challenge";
import { usePlayXp } from "@/state/play-xp";
import { trackFunnel } from "./telemetry";

/**
 * Record a single finished run across every client-side stat store: the
 * in-memory session stats, the persisted lifetime play-XP, and the daily
 * challenge streak. Called from the one game-over chokepoint in useGameSession.
 */
export function recordFinishedRun(gameId: GameId, score: number): void {
  useSessionStats.getState().recordResult(gameId, score);
  usePlayXp.getState().addPlay(gameId, score);
  useDailyChallenge.getState().recordPlay(gameId, score);
  trackFunnel("game_over", { game: gameId });
}
