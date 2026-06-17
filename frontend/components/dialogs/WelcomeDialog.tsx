"use client";

const STEPS: { n: number; emoji: string; label: string; body: string }[] = [
  { n: 1, emoji: "🎯", label: "PLAY", body: "6 retro games" },
  { n: 2, emoji: "💾", label: "MINT", body: "your score as a Score NFT" },
  {
    n: 3,
    emoji: "🏆",
    label: "CLIMB",
    body: "the on-chain top-10 & split the STX prize pool",
  },
];

export function WelcomeDialog({
  onPlay,
  onClose,
}: {
  onPlay: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="window"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to XP Arcade"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 360,
        zIndex: 1000,
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">🎮 Welcome to XP Arcade</div>
        <div className="title-bar-controls">
          <button type="button" aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 44, lineHeight: 1 }}>🕹️</span>
          <p style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>
            A Windows 95 arcade where your scores become NFTs — and top players
            split a real STX prize pool each season.
          </p>
        </div>

        <ol
          style={{
            listStyle: "none",
            margin: "0 0 12px",
            padding: "8px 10px",
            border: "1px solid #808080",
            borderRightColor: "#ffffff",
            borderBottomColor: "#ffffff",
            background: "#ffffff",
            display: "grid",
            gap: 6,
            fontSize: 11,
          }}
        >
          {STEPS.map((step) => (
            <li key={step.n} style={{ display: "flex", gap: 6 }}>
              <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>
                {step.n}. {step.emoji} {step.label}
              </span>
              <span style={{ color: "#444" }}>{step.body}</span>
            </li>
          ))}
        </ol>

        <p style={{ fontSize: 10, color: "#666", margin: "0 0 14px" }}>
          No wallet needed to play — connect only when you want to mint.
        </p>

        <div
          style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
        >
          <button type="button" onClick={onClose}>
            Maybe later
          </button>
          <button
            type="button"
            className="default"
            onClick={onPlay}
            style={{ fontWeight: "bold" }}
          >
            ▶ Play Now
          </button>
        </div>
      </div>
    </div>
  );
}
