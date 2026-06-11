import { GAMES, type GameId } from "@/lib/game-registry";
import { scoreRarity, shortPlayer } from "@/lib/leaderboard-showcase";
import { rarityColor } from "@/lib/metadata-svg";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

export const GAME_BG: Record<GameId, string> = {
  snake: "#1a472a",
  tetris: "#6b3a2a",
  pacman: "#1a1a2e",
  breakout: "#164e63",
  minesweeper: "#3a3a3a",
};

export type ScoreCardInput = {
  gameId: GameId;
  score: number;
  player?: string | null;
  rankHint?: string | null;
  txId?: string | null;
};

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  ctx.fillText(text, x, y, maxWidth);
}

export function drawScoreCard(
  canvas: HTMLCanvasElement,
  input: ScoreCardInput,
) {
  const game = GAMES[input.gameId];
  const rarity = scoreRarity(input.score);
  const accent = rarityColor(rarity);
  const bg = GAME_BG[input.gameId];
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, bg);
  gradient.addColorStop(1, "#101010");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(54, 54, CARD_WIDTH - 108, CARD_HEIGHT - 108);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(58, 58, CARD_WIDTH - 116, 3);
  ctx.fillRect(58, 58, 3, CARD_HEIGHT - 116);
  ctx.fillStyle = "#404040";
  ctx.fillRect(58, CARD_HEIGHT - 61, CARD_WIDTH - 116, 3);
  ctx.fillRect(CARD_WIDTH - 61, 58, 3, CARD_HEIGHT - 116);

  ctx.fillStyle = "#000080";
  ctx.fillRect(66, 66, CARD_WIDTH - 132, 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Arial, sans-serif";
  drawText(ctx, `${game.emoji} ${game.label} Score Card`, 86, 98, 680);
  ctx.textAlign = "right";
  ctx.font = "18px Arial, sans-serif";
  drawText(ctx, "XP Arcade on Stacks", CARD_WIDTH - 86, 98, 360);
  ctx.textAlign = "left";

  ctx.fillStyle = "#efefef";
  ctx.fillRect(86, 148, CARD_WIDTH - 172, 350);
  ctx.strokeStyle = "#808080";
  ctx.lineWidth = 2;
  ctx.strokeRect(86, 148, CARD_WIDTH - 172, 350);

  ctx.fillStyle = "#111111";
  ctx.font = "bold 170px Arial, sans-serif";
  drawText(ctx, String(input.score), 126, 332, 620);

  ctx.fillStyle = accent;
  ctx.font = "bold 42px Arial, sans-serif";
  drawText(ctx, rarity, 132, 392, 400);

  ctx.fillStyle = "#333333";
  ctx.font = "28px Arial, sans-serif";
  const player = input.player ? shortPlayer(input.player) : "Unminted run";
  drawText(ctx, player, 132, 444, 500);

  ctx.fillStyle = accent;
  ctx.fillRect(CARD_WIDTH - 350, 170, 190, 190);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 112px Arial, sans-serif";
  ctx.textAlign = "center";
  drawText(ctx, game.emoji, CARD_WIDTH - 255, 302, 180);
  ctx.textAlign = "left";

  ctx.fillStyle = "#222222";
  ctx.font = "24px Arial, sans-serif";
  drawText(ctx, input.rankHint ?? "Ready to mint on-chain", CARD_WIDTH - 420, 414, 320);
  if (input.txId) {
    ctx.font = "18px monospace";
    drawText(ctx, `tx ${input.txId.slice(0, 10)}...${input.txId.slice(-6)}`, CARD_WIDTH - 420, 454, 320);
  }

  ctx.fillStyle = "#111111";
  ctx.font = "20px Arial, sans-serif";
  drawText(ctx, "Play. Mint. Climb the leaderboard.", 86, CARD_HEIGHT - 86, 520);
  ctx.textAlign = "right";
  drawText(ctx, "xp-snake.vercel.app", CARD_WIDTH - 86, CARD_HEIGHT - 86, 360);
  ctx.textAlign = "left";
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
