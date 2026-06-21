/** Session-scoped memory of the last-seen arcade champion, keyed by season so a
 *  season rollover starts empty (the new season's first champion does not flash
 *  the NEW CHAMPION banner). */
function key(season: number | null): string {
  return `arcade-champ-seen:${season ?? "unknown"}`;
}

export function loadSeenChampion(season: number | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key(season));
  } catch {
    return null;
  }
}

export function saveSeenChampion(season: number | null, player: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key(season), player);
  } catch {
    /* storage blocked → no-op */
  }
}
