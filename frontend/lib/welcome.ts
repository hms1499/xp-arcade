export const WELCOME_STORAGE_KEY = "xp-arcade:welcomed";

// SSR / blocked-storage default is "already seen" so we never auto-pop where a
// dismissal cannot be persisted.
export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* storage blocked → no-op */
  }
}
