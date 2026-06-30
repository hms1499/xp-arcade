"use client";
import { useLevelUpToast } from "@/hooks/useLevelUpToast";

/** Invisible: runs the level-up watcher inside a client boundary. */
export function LevelUpWatcher() {
  useLevelUpToast();
  return null;
}
