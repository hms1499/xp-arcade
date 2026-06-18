"use client";
import { useEffect, useRef, useState } from "react";
import { type GameId } from "@/lib/game-registry";
import { scoreShareUrl, xIntentUrl } from "@/lib/share";

export function ShareActions({
  gameId,
  score,
  tokenId,
}: {
  gameId: GameId;
  score: number;
  tokenId?: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function handleShareOnX() {
    window.open(xIntentUrl(gameId, score, tokenId ?? null), "_blank", "noopener");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(scoreShareUrl(tokenId ?? null));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions / insecure context) — leave label as-is
    }
  }

  return (
    <>
      <button type="button" onClick={handleShareOnX}>
        Share on X
      </button>
      <button type="button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy link"}
      </button>
    </>
  );
}
