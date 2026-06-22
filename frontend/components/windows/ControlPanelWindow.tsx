"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "@/components/windows/Window";
import { useSettings } from "@/state/settings";

function clearLocalData() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith("xp-arcade")) keys.push(k);
  }
  keys.forEach((k) => window.localStorage.removeItem(k));
  window.location.reload();
}

const hint = {
  fontSize: 10,
  color: "#555",
  margin: "4px 0 0",
  lineHeight: 1.35,
} as const;

export function ControlPanelWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "control-panel"),
  );
  const soundMuted = useSettings((s) => s.soundMuted);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const toggleSound = useSettings((s) => s.toggleSound);
  const toggleReducedMotion = useSettings((s) => s.toggleReducedMotion);

  if (!w) return null;

  return (
    <Window id={w.id} title="⚙️ Control Panel" width={360}>
      <div style={{ display: "grid", gap: 10, fontSize: 11, padding: 2 }}>
        <fieldset>
          <legend>Sound</legend>
          <div className="field-row">
            <input
              type="checkbox"
              id="cp-sound"
              checked={!soundMuted}
              onChange={toggleSound}
            />
            <label htmlFor="cp-sound">Enable sound effects</label>
          </div>
          <p style={hint}>
            Turns off the boot chime, game blips, and notification dings.
          </p>
        </fieldset>

        <fieldset>
          <legend>Motion</legend>
          <div className="field-row">
            <input
              type="checkbox"
              id="cp-motion"
              checked={reducedMotion}
              onChange={toggleReducedMotion}
            />
            <label htmlFor="cp-motion">Reduce animations</label>
          </div>
          <p style={hint}>
            Calms wallpaper, ticker, and window transitions. Your system
            “reduce motion” setting is always respected too.
          </p>
        </fieldset>

        <fieldset>
          <legend>Data</legend>
          <p style={{ ...hint, marginTop: 0 }}>
            Clears local preferences, dismissed dialogs, and cached scores on
            this device. Does not touch anything on-chain.
          </p>
          <button
            type="button"
            style={{ marginTop: 6 }}
            onClick={() => {
              if (
                window.confirm(
                  "Reset the desktop and clear local data on this device? " +
                    "Your on-chain scores and NFTs are not affected.",
                )
              ) {
                clearLocalData();
              }
            }}
          >
            Reset desktop &amp; clear local data
          </button>
        </fieldset>
      </div>
    </Window>
  );
}
