"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/state/wallet";
import { TrayBalloon } from "./TrayBalloon";

export function WalletBalloon() {
  const address = useWallet((s) => s.address);
  const connect = useWallet((s) => s.connect);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (address) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("balloon-dismissed") === "1") return;

    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [address]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem("balloon-dismissed", "1");
    }, 8000);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem("balloon-dismissed", "1");
  }

  if (!visible || address) return null;

  return (
    <TrayBalloon
      icon="🦊"
      title="Connect your wallet"
      body="Save scores on-chain & mint NFTs"
      ctaLabel="Connect Now"
      onCta={connect}
      onDismiss={dismiss}
      ariaLabel="Dismiss wallet reminder"
    />
  );
}
