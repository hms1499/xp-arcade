"use client";
import { useEffect, useState } from "react";

/**
 * Pure-ish timer core: calls `onIdle` after `ms` without `notifyActivity()`.
 * Extracted from the hook so it can be unit-tested with fake timers.
 */
export function createIdleWatcher(ms: number, onIdle: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) onIdle();
    }, ms);
  };
  return {
    start() {
      stopped = false;
      arm();
    },
    notifyActivity() {
      if (!stopped) arm();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

const ACTIVITY_EVENTS = ["mousemove", "keydown", "pointerdown", "touchstart"] as const;

/** Returns true after `ms` of no user input; resets on activity or tab-hide. */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const watcher = createIdleWatcher(ms, () => setIdle(true));
    const onActivity = () => {
      setIdle(false);
      watcher.notifyActivity();
    };
    const onVisibility = () => {
      if (document.hidden) {
        setIdle(false);
        watcher.stop();
      } else {
        watcher.start();
      }
    };
    watcher.start();
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.stop();
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);

  return idle;
}
