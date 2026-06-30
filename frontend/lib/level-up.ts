import { levelTitle } from "./level";
import type { ToastType } from "@/state/toasts";

export type LevelUpToast = { title: string; body: string; type: ToastType };

/**
 * Decide what toast (if any) to show when level moves prevLevel -> nextLevel.
 * Returns null when nextLevel <= prevLevel. A jump that crosses a title band
 * (e.g. 9 -> 10 enters "Pro") yields a success "New title" toast; any other
 * increase yields a plain info "Level N" toast.
 */
export function decideLevelUpToast(args: {
  prevLevel: number;
  nextLevel: number;
}): LevelUpToast | null {
  const { prevLevel, nextLevel } = args;
  if (nextLevel <= prevLevel) return null;
  const newTitle = levelTitle(nextLevel);
  if (newTitle !== levelTitle(prevLevel)) {
    return {
      title: `New title: ${newTitle}!`,
      body: `Reached Level ${nextLevel}.`,
      type: "success",
    };
  }
  return {
    title: `Level ${nextLevel}!`,
    body: "Keep playing to level up.",
    type: "info",
  };
}

/**
 * Pure watcher transition. On the first observation for an address
 * (baselined === false) it absorbs the current level silently (no toast) so XP
 * earned while the app was closed is never announced. Once baselined, a rise
 * above ack produces a toast and raises ack; anything else is a no-op.
 */
export function levelUpStep(args: {
  baselined: boolean;
  ack: number;
  level: number;
}): { ack: number; baselined: boolean; toast: LevelUpToast | null } {
  const { baselined, ack, level } = args;
  if (!baselined) {
    return { ack: Math.max(ack, level), baselined: true, toast: null };
  }
  if (level > ack) {
    return {
      ack: level,
      baselined: true,
      toast: decideLevelUpToast({ prevLevel: ack, nextLevel: level }),
    };
  }
  return { ack, baselined: true, toast: null };
}
