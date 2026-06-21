"use client";
import { useEffect, useMemo, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { useWallet } from "@/state/wallet";
import { Window } from "@/components/windows/Window";
import { ChampionBoard } from "@/components/champion/ChampionBoard";
import { fetchLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { computeArcadeChampions, type RowsByGame } from "@/lib/arcade-champion";
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
  const [rows, setRows] = useState<RowsByGame | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const open = !!w;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    function load() {
      fetchLeaderboardSnapshot()
        .then((snap) => {
          if (cancelled) return;
          setRows(rowsFromSnapshot(snap.games));
          setSeason(snap.games.snake?.currentSeason ?? null);
          setLastUpdated(new Date());
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

  const champions = useMemo(() => (rows ? computeArcadeChampions(rows) : []), [rows]);

  if (!w) return null;

  return (
    <Window id={w.id} title="👑 Arcade Champion" width={460}>
      <ChampionBoard
        champions={champions}
        season={season}
        address={address}
        newChampion={null}
        lastUpdated={lastUpdated}
      />
    </Window>
  );
}
