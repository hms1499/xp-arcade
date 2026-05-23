"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type DesktopThemeId = "night-city" | "classic-teal" | "arcade-grid";

export type DesktopThemeOption = {
  id: DesktopThemeId;
  label: string;
  description: string;
};

export const DESKTOP_THEMES: DesktopThemeOption[] = [
  {
    id: "night-city",
    label: "Night City",
    description: "Animated skyline with stars and city lights.",
  },
  {
    id: "classic-teal",
    label: "Classic Teal",
    description: "Quiet Windows-style solid desktop.",
  },
  {
    id: "arcade-grid",
    label: "Arcade Grid",
    description: "Retro grid with restrained scanlines.",
  },
];

export function isDesktopThemeId(value: string): value is DesktopThemeId {
  return DESKTOP_THEMES.some((theme) => theme.id === value);
}

type State = {
  theme: DesktopThemeId;
  setTheme: (theme: DesktopThemeId) => void;
};

export const useDesktopTheme = create<State>()(
  persist(
    (set) => ({
      theme: "night-city",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "xp-arcade-desktop-theme",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ theme: state.theme }),
      merge: (persisted, current) => {
        const theme =
          typeof persisted === "object" &&
          persisted !== null &&
          "theme" in persisted &&
          typeof persisted.theme === "string" &&
          isDesktopThemeId(persisted.theme)
            ? persisted.theme
            : current.theme;
        return { ...current, theme };
      },
    },
  ),
);
