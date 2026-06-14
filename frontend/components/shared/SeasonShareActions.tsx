"use client";
import { useState } from "react";
import { type GameId } from "@/lib/game-registry";
import { seasonShareUrl, xSeasonIntentUrl } from "@/lib/share";

export function SeasonShareActions({
  gameId,
  season,
}: {
  gameId: GameId;
  season: number;
}) {
  const [copied, setCopied] = useState(false);

  function handleShareOnX() {
    window.open(xSeasonIntentUrl(gameId, season), "_blank", "noopener");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(seasonShareUrl(gameId, season));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions / insecure context) — leave label as-is
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button
        type="button"
        onClick={handleShareOnX}
        style={{ fontSize: 10, padding: "1px 6px" }}
      >
        Share
      </button>
      <button
        type="button"
        onClick={handleCopy}
        style={{ fontSize: 10, padding: "1px 6px" }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </span>
  );
}
