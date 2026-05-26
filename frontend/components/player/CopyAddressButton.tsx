"use client";
import { useState } from "react";

export function CopyAddressButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
