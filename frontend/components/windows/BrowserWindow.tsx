// frontend/components/windows/BrowserWindow.tsx
"use client";
import { useState } from "react";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { normalizeUrl } from "@/lib/embed-url";

type Status = "idle" | "checking" | "embedded" | "blocked" | "error";

export function BrowserWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "browser"));
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [embedUrl, setEmbedUrl] = useState("");
  const [message, setMessage] = useState("");

  if (!w) return null;

  async function go() {
    // Clear any stale target so the error/blocked panel's "Open in new tab"
    // can't point at a previously-navigated URL.
    setEmbedUrl("");
    const normalized = normalizeUrl(input);
    if (!normalized.ok) {
      setStatus("error");
      setMessage(normalized.reason);
      return;
    }
    setStatus("checking");
    setMessage("");
    try {
      const res = await fetch(
        `/api/embed-check?url=${encodeURIComponent(normalized.url)}`,
      );
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Could not load address");
        return;
      }
      setEmbedUrl(body.finalUrl);
      if (body.embeddable) {
        setStatus("embedded");
      } else {
        setStatus("blocked");
        setMessage(body.reason ?? "This site can't be shown here");
      }
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  return (
    <Window id={w.id} title="Internet">
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", gap: 4, padding: 4 }}>
          <input
            type="text"
            value={input}
            placeholder="Type an address and press Go"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            style={{ flex: 1 }}
            aria-label="Address"
          />
          <button onClick={go}>Go</button>
        </div>

        <div style={{ flex: 1, minHeight: 320, position: "relative" }}>
          {status === "idle" && (
            <p style={{ padding: 8 }}>
              Type an address above and press <b>Go</b> to browse while you play.
            </p>
          )}
          {status === "checking" && <p style={{ padding: 8 }}>Loading…</p>}
          {status === "embedded" && (
            <iframe
              title="Embedded page"
              src={embedUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          )}
          {(status === "blocked" || status === "error") && (
            <div style={{ padding: 8 }}>
              <p>{message}</p>
              {embedUrl && (
                <button onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")}>
                  Open in new tab
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}
