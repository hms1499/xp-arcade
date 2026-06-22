"use client";
import { useEffect } from "react";
import { useWindows } from "@/state/window-manager";

/**
 * Global keyboard shortcuts for window management. Escape closes the topmost
 * utility window (High Scores, Control Panel, …). Games and the browser keep
 * Escape for their own use (pause), so the store only acts when a utility
 * window is actually on top. Renders nothing.
 */
export function WindowKeyboard() {
  const closeTopWindowIfUtility = useWindows((s) => s.closeTopWindowIfUtility);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeTopWindowIfUtility();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTopWindowIfUtility]);

  return null;
}
