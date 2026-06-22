"use client";
import { create } from "zustand";

const STORAGE_KEY = "xp-arcade:settings";

export type SettingsValues = {
  soundMuted: boolean;
  reducedMotion: boolean;
};

const DEFAULTS: SettingsValues = { soundMuted: false, reducedMotion: false };

function readStored(): SettingsValues {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SettingsValues>;
    return {
      soundMuted: parsed.soundMuted ?? DEFAULTS.soundMuted,
      reducedMotion: parsed.reducedMotion ?? DEFAULTS.reducedMotion,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(values: SettingsValues) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* ignore quota / private-mode write errors */
  }
}

type SettingsState = SettingsValues & {
  toggleSound: () => void;
  toggleReducedMotion: () => void;
  hydrate: () => void;
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  toggleSound: () => {
    const next: SettingsValues = {
      soundMuted: !get().soundMuted,
      reducedMotion: get().reducedMotion,
    };
    persist(next);
    set({ soundMuted: next.soundMuted });
  },
  toggleReducedMotion: () => {
    const next: SettingsValues = {
      soundMuted: get().soundMuted,
      reducedMotion: !get().reducedMotion,
    };
    persist(next);
    set({ reducedMotion: next.reducedMotion });
  },
  hydrate: () => set(readStored()),
}));
