"use client";
import { useEffect, useRef, useState } from "react";

export function CopyAddressButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-[10px] ml-2"
      aria-label="Copy player address"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
