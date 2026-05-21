export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#9ca3af",
  Rare: "#3b82f6",
  Epic: "#a855f7",
  Legendary: "#f59e0b",
};

export function rarityColor(r: string): string {
  return RARITY_COLOR[r as Rarity] ?? RARITY_COLOR.Common;
}

const GAME_BG: Record<string, string> = {
  Snake: "#245edb",
  Tetris: "#1a472a",
  "Pac-Man": "#1a1a2e",
};

export function scoreSvg(o: {
  tokenId: number;
  score: number;
  playerName: string;
  rarity: string;
  gameName?: string;
}) {
  const game = o.gameName ?? "Snake";
  const bg = GAME_BG[game] ?? "#245edb";
  const headerBg = bg + "cc";
  const color = rarityColor(o.rarity);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect width="400" height="400" fill="${bg}"/>
  <rect x="0" y="0" width="400" height="32" fill="${headerBg}"/>
  <rect x="0" y="0" width="400" height="4" fill="${color}"/>
  <text x="12" y="22" font-family="Tahoma, sans-serif" font-size="14" fill="white">${escapeXml(game)} Score #${o.tokenId}</text>
  <text x="200" y="220" font-family="Tahoma, sans-serif" font-weight="bold" font-size="140" fill="white" text-anchor="middle">${o.score}</text>
  <text x="200" y="280" font-family="Tahoma, sans-serif" font-size="22" fill="white" text-anchor="middle">${escapeXml(o.playerName)}</text>
  <text x="388" y="22" font-family="Tahoma, sans-serif" font-size="11" fill="${color}" text-anchor="end">${o.rarity}</text>
  <text x="200" y="370" font-family="Tahoma, sans-serif" font-size="14" fill="#bcd" text-anchor="middle">XP Arcade on Stacks</text>
</svg>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
