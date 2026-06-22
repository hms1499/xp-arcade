"use client";
import { useEffect } from "react";
import { useSettings } from "@/state/settings";
import { setSoundMuted } from "@/lib/sounds";

/**
 * Applies persisted Control Panel preferences to the live app: hydrates the
 * store from localStorage on mount, mirrors sound-mute into the sound engine,
 * and toggles the reduce-motion body class. Renders nothing.
 */
export function SettingsEffects() {
  const hydrate = useSettings((s) => s.hydrate);
  const soundMuted = useSettings((s) => s.soundMuted);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSoundMuted(soundMuted);
  }, [soundMuted]);

  useEffect(() => {
    document.body.classList.toggle("reduce-motion", reducedMotion);
  }, [reducedMotion]);

  return null;
}
