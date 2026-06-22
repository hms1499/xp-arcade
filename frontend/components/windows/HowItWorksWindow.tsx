"use client";
import { useWindows } from "@/state/window-manager";
import { Window } from "@/components/windows/Window";
import { stacks } from "@/lib/stacks";
import { prizeSplitBands } from "@/lib/payout-schedule";

const STEPS: { emoji: string; title: string; body: string }[] = [
  {
    emoji: "🎯",
    title: "Play",
    body: "Pick any of the arcade games. Playing is always free — no wallet needed.",
  },
  {
    emoji: "💾",
    title: "Mint",
    body: "Turn a run into a Score NFT. The small mint fee goes straight into that game's prize pool, held by the contract.",
  },
  {
    emoji: "🏆",
    title: "Climb",
    body: "Each game keeps an on-chain top-10 for the season. Beat the #10 score to take a spot.",
  },
  {
    emoji: "💰",
    title: "Claim",
    body: "When the season ends, top-10 players claim their STX share directly on-chain. Nothing is paid out by us.",
  },
];

const sectionTitle = {
  fontWeight: "bold" as const,
  margin: "0 0 4px",
};

const hint = { fontSize: 10, color: "#555", lineHeight: 1.4 };

export function HowItWorksWindow() {
  const w = useWindows((s) =>
    s.windows.find((win) => win.type === "how-it-works"),
  );
  if (!w) return null;

  const contractId = `${stacks.contractAddress}.${stacks.contractName}`;
  const explorerUrl = `https://explorer.hiro.so/address/${contractId}?chain=${stacks.networkName}`;
  const bands = prizeSplitBands();

  return (
    <Window id={w.id} title="❔ How It Works" width={420}>
      <div style={{ display: "grid", gap: 12, fontSize: 11, padding: 2 }}>
        <p style={{ margin: 0, lineHeight: 1.4 }}>
          XP Arcade is <b>provably fair</b>: scores, the prize pool, and payouts
          all live on the Stacks blockchain. We never hold or hand out the
          prize money — the contract does.
        </p>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8 }}>
              <span style={{ fontSize: 22, textAlign: "center" }} aria-hidden="true">
                {s.emoji}
              </span>
              <span>
                <b>
                  {i + 1}. {s.title}
                </b>
                <span style={{ display: "block", color: "#444", lineHeight: 1.35 }}>
                  {s.body}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <fieldset>
          <legend>Prize split (per game, per season)</legend>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {bands.map((b) => (
                <tr key={b.label}>
                  <td style={{ paddingBottom: 2 }}>{b.label}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", color: "#000080" }}>
                    {b.percentEach.toFixed(b.percentEach % 1 === 0 ? 0 : 2)}% each
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...hint, margin: "6px 0 0" }}>
            Tied scores split the combined value of the positions they occupy.
            Unclaimed shares roll into next season&apos;s pool — nothing is ever
            locked away.
          </p>
        </fieldset>

        <fieldset>
          <legend>Verified on-chain</legend>
          <p style={{ ...hint, margin: "0 0 4px" }}>
            Network: <b>{stacks.networkName}</b>
          </p>
          <p style={{ ...sectionTitle, fontSize: 10 }}>Registry contract</p>
          <p style={{ fontFamily: "monospace", fontSize: 9, wordBreak: "break-all", margin: "0 0 6px" }}>
            {contractId}
          </p>
          <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#000080" }}>
            🔗 Inspect the contract on Hiro Explorer ↗
          </a>
        </fieldset>
      </div>
    </Window>
  );
}
