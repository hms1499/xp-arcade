"use client";
import { useEffect } from "react";
import { parseChallengeParams } from "@/lib/challenge-link";
import { useChallenge } from "@/state/challenge";

export function ChallengeLoader() {
  const setPending = useChallenge((s) => s.setPending);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const challenge = parseChallengeParams(url.searchParams);
    if (!challenge) return;
    setPending(challenge);
    // Strip the challenge params so a refresh / re-share does not re-trigger.
    url.searchParams.delete("challenge");
    url.searchParams.delete("score");
    url.searchParams.delete("by");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [setPending]);

  return null;
}
