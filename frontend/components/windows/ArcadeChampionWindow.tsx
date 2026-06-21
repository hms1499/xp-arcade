"use client";
import { useEffect, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { ChampionBoard } from "@/components/champion/ChampionBoard";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { computeArcadeChampions, detectNewChampion, type RowsByGame, type ChampionEntry } from "@/lib/arcade-champion";
import { loadSeenChampion, saveSeenChampion } from "@/lib/champion-seen";
import { GAME_IDS } from "@/lib/game-registry";

function rowsFromSnapshot(games: Awaited<ReturnType<typeof fetchLeaderboardSnapshot>>["games"]): RowsByGame {
  return GAME_IDS.reduce((acc, id) => {
    acc[id] = games[id]?.topTen ?? [];
    return acc;
  }, {} as RowsByGame);
}

export function ArcadeChampionWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "arcade-champion"));
  const address = useWallet((s) => s.address);
  const [champions, setChampions] = useState<ChampionEntry[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newChampion, setNewChampion] = useState<{ player: string; dethroned: string | null } | null>(null);

  const open = !!w;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    function load() {
      fetchLeaderboardSnapshot()
        .then((snap) => {
          if (cancelled) return;
          const rows = rowsFromSnapshot(snap.games);
          const currentSeason = snap.games.snake?.currentSeason ?? null;
          const computed = computeArcadeChampions(rows);
          setSeason(currentSeason);
          setChampions(computed);
          setLastUpdated(new Date());
          if (computed.length > 0) {
            const prev = loadSeenChampion(currentSeason);
            const change = detectNewChampion(prev, computed);
            if (change) setNewChampion(change);
            saveSeenChampion(currentSeason, computed[0].player);
          }
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  if (!w) return null;

  return (
    <Window id={w.id} title="👑 Arcade Champion" width={460}>
      <ChampionBoard
        champions={champions}
        season={season}
        address={address}
        newChampion={newChampion}
        lastUpdated={lastUpdated}
      />
    </Window>
  );
}
