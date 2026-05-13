export function scoreSvg(o: {
  tokenId: number;
  score: number;
  playerName: string;
}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect width="400" height="400" fill="#245edb"/>
  <rect x="0" y="0" width="400" height="32" fill="#3a78d8"/>
  <text x="12" y="22" font-family="Tahoma, sans-serif" font-size="14" fill="white">Snake Score #${o.tokenId}</text>
  <text x="200" y="220" font-family="Tahoma, sans-serif" font-weight="bold" font-size="140" fill="white" text-anchor="middle">${o.score}</text>
  <text x="200" y="280" font-family="Tahoma, sans-serif" font-size="22" fill="white" text-anchor="middle">${escapeXml(o.playerName)}</text>
  <text x="200" y="370" font-family="Tahoma, sans-serif" font-size="14" fill="#bcd" text-anchor="middle">XP Snake on Stacks</text>
</svg>`;
}

const TIER = (rank: number) => {
  if (rank === 1) return { label: "Gold", color: "#ffd700", emoji: "🏆" };
  if (rank === 2) return { label: "Silver", color: "#c0c0c0", emoji: "🥈" };
  if (rank === 3) return { label: "Bronze", color: "#cd7f32", emoji: "🥉" };
  return { label: "Top 10", color: "#4477aa", emoji: "🎖️" };
};

export function trophySvg(o: { trophyId: number; rank: number; season: number }) {
  const t = TIER(o.rank);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect width="400" height="400" fill="${t.color}"/>
  <text x="200" y="220" font-size="180" text-anchor="middle">${t.emoji}</text>
  <text x="200" y="290" font-family="Tahoma, sans-serif" font-weight="bold" font-size="36" fill="black" text-anchor="middle">${t.label}</text>
  <text x="200" y="330" font-family="Tahoma, sans-serif" font-size="18" fill="black" text-anchor="middle">Rank #${o.rank} - Season ${o.season}</text>
  <text x="200" y="380" font-family="Tahoma, sans-serif" font-size="12" fill="black" text-anchor="middle">Trophy #${o.trophyId}</text>
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
