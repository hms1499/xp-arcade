// frontend/components/windows/BrowserWindow.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useWindows } from "@/state/window-manager";
import { Window } from "./Window";
import { normalizeUrl } from "@/lib/embed-url";

type Status = "idle" | "checking" | "embedded" | "remote" | "blocked" | "error";

const IDLE_MS = 120_000;

export function BrowserWindow() {
  const w = useWindows((s) => s.windows.find((win) => win.type === "browser"));
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [embedUrl, setEmbedUrl] = useState("");
  const [liveViewUrl, setLiveViewUrl] = useState("");
  const [message, setMessage] = useState("");

  const sessionIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Best-effort release that survives unmount (sendBeacon, falls back to fetch).
  function releaseSession() {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    const payload = JSON.stringify({ sessionId: id });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/browser/end", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/browser/end", { method: "POST", body: payload, keepalive: true }).catch(() => {});
    }
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function stopRemote(next: Status) {
    clearIdleTimer();
    releaseSession();
    setLiveViewUrl("");
    setStatus(next);
  }

  function armIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // Idle close: drop the paid session and return to the homepage.
      stopRemote("idle");
      setMessage("");
    }, IDLE_MS);
  }

  // Idle handling while remote. The live view is a cross-origin iframe, so we
  // cannot see interaction inside it. Heuristic: while the iframe holds focus,
  // pause the countdown (treat as active); otherwise count down. The
  // Browserbase server timeout is the authoritative cap.
  useEffect(() => {
    if (status !== "remote") return;
    armIdleTimer();
    const onBlur = () => {
      if (document.activeElement === iframeRef.current) clearIdleTimer(); // active in iframe
    };
    const onFocus = () => armIdleTimer();
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Release the session if the window unmounts (closed).
  useEffect(() => {
    return () => {
      clearIdleTimer();
      releaseSession();
    };
  }, []);

  if (!w) return null;

  async function startRemote(url: string) {
    try {
      const res = await fetch("/api/browser/session", { method: "POST" });
      if (!res.ok) {
        // Unconfigured (503) or create error → degrade to v1 fallback.
        setStatus("blocked");
        setEmbedUrl(url);
        setMessage("This site can't be shown here.");
        return;
      }
      const body = await res.json();
      sessionIdRef.current = body.sessionId;
      setLiveViewUrl(body.liveViewUrl);
      setStatus("remote");
      // Point the fresh session at the requested page.
      await fetch("/api/browser/navigate", {
        method: "POST",
        body: JSON.stringify({ sessionId: body.sessionId, url }),
      }).catch(() => {});
    } catch {
      setStatus("blocked");
      setEmbedUrl(url);
      setMessage("This site can't be shown here.");
    }
  }

  async function navigateRemote(url: string) {
    setStatus("remote");
    armIdleTimer();
    await fetch("/api/browser/navigate", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionIdRef.current, url }),
    }).catch(() => {});
  }

  async function go() {
    setEmbedUrl("");
    const normalized = normalizeUrl(input);
    if (!normalized.ok) {
      setStatus("error");
      setMessage(normalized.reason);
      return;
    }
    setStatus("checking");
    setMessage("");

    let embeddable = false;
    let badInput = false;
    try {
      const res = await fetch(`/api/embed-check?url=${encodeURIComponent(normalized.url)}`);
      if (res.status === 400) {
        badInput = true;
      } else if (res.ok) {
        const body = await res.json();
        embeddable = Boolean(body.embeddable);
      }
    } catch {
      embeddable = false; // unreachable check → try remote
    }

    if (badInput) {
      setStatus("error");
      setMessage("Could not load address");
      return;
    }

    if (embeddable) {
      // Free path: drop any paid session and use a plain iframe.
      if (sessionIdRef.current) stopRemote("embedded");
      setEmbedUrl(normalized.url);
      setStatus("embedded");
      return;
    }

    // Remote path.
    if (sessionIdRef.current) {
      await navigateRemote(normalized.url);
    } else {
      await startRemote(normalized.url);
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
            onFocus={clearIdleTimer}
            style={{ flex: 1 }}
            aria-label="Address"
          />
          <button onClick={go}>Go</button>
          {status === "remote" && (
            <button onClick={() => stopRemote("idle")}>Stop session</button>
          )}
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
          {status === "remote" && (
            <iframe
              ref={iframeRef}
              title="Remote browser"
              src={liveViewUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="clipboard-read; clipboard-write"
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
