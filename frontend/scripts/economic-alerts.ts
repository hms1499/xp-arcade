import {
  cvToValue,
  fetchCallReadOnlyFunction,
  uintCV,
} from "@stacks/transactions";
import {
  computeAlerts,
  formatDiscordMessage,
  type ChainSnapshot,
  type ClosedSeason,
  type GameState,
  type Thresholds,
} from "../lib/economic-alerts.ts";

const API_URL = (process.env.STACKS_API_URL ?? "https://api.hiro.so").replace(/\/$/, "");
const CONTRACT_ADDRESS = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const CONTRACT_NAME = "xp-arcade-v4";
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

const THRESHOLDS: Thresholds = {
  seasonEndWarnBlocks: Number(process.env.SEASON_END_WARN_BLOCKS ?? 1000),
  claimWarnBurnBlocks: Number(process.env.CLAIM_WARN_BURN_BLOCKS ?? 432),
};

// slug matches GAME_IDS (breakout, not bricks)
const GAMES: Array<{ slug: string; id: number }> = [
  { slug: "snake", id: 1 },
  { slug: "tetris", id: 2 },
  { slug: "pacman", id: 3 },
  { slug: "breakout", id: 4 },
  { slug: "minesweeper", id: 5 },
  { slug: "solitaire", id: 6 },
];

function fetchWithTimeout(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
}

async function readOnly(functionName: string, functionArgs: ReturnType<typeof uintCV>[] = []) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: CONTRACT_ADDRESS,
    network: "mainnet",
    client: { baseUrl: API_URL, fetch: fetchWithTimeout },
  });
  return cvToValue(result);
}

async function fetchTips(): Promise<{ stacksTip: number; burnTip: number }> {
  const res = await fetchWithTimeout(`${API_URL}/v2/info`);
  if (!res.ok) throw new Error(`/v2/info returned HTTP ${res.status}`);
  const info = await res.json();
  return {
    stacksTip: Number(info.stacks_tip_height),
    burnTip: Number(info.burn_block_height),
  };
}

async function readClosedSeason(id: number, season: number): Promise<ClosedSeason | null> {
  // get-season-prize returns (optional { total, top-ten, claim-deadline }); cvToValue → null when none.
  // cvToValue wraps OptionalSome and Tuple children via cvToJSON, so the payload is
  // { type: "(tuple ...)", value: { total: { type, value }, "claim-deadline": { type, value }, ... } }
  // — one extra unwrap layer beyond a flat tuple. Hedge both shapes defensively.
  const prize = await readOnly("get-season-prize", [uintCV(id), uintCV(season)]);
  if (prize == null) return null;
  const fields = prize.value ?? prize;
  const totalField = fields.total;
  const total = Number(totalField?.value ?? totalField);
  const deadlineField = fields["claim-deadline"];
  const claimDeadline = Number(deadlineField?.value ?? deadlineField);
  const paid = Number(await readOnly("get-season-paid", [uintCV(id), uintCV(season)]));
  const finalized = Boolean(await readOnly("get-season-finalized", [uintCV(id), uintCV(season)]));
  return { season, total, paid, finalized, claimDeadline };
}

async function readGame(slug: string, id: number): Promise<GameState> {
  const currentSeason = Number(await readOnly("get-current-season", [uintCV(id)]));
  const seasonEndBlock = Number(await readOnly("get-season-end-block", [uintCV(id)]));

  const closedSeasons: ClosedSeason[] = [];
  const first = Math.max(1, currentSeason - 2);
  for (let s = first; s <= currentSeason - 1; s++) {
    const closed = await readClosedSeason(id, s);
    if (closed) closedSeasons.push(closed);
  }

  return { game: slug, currentSeason, seasonEndBlock, closedSeasons };
}

async function main() {
  const { stacksTip, burnTip } = await fetchTips();
  const games: GameState[] = [];
  for (const { slug, id } of GAMES) {
    games.push(await readGame(slug, id));
  }
  const snapshot: ChainSnapshot = { stacksTip, burnTip, games };

  const alerts = computeAlerts(snapshot, THRESHOLDS);
  if (alerts.length === 0) {
    console.log("No economic alerts.");
    return;
  }

  const { content } = formatDiscordMessage(alerts);
  if (!WEBHOOK_URL) {
    console.log("ALERT_WEBHOOK_URL not set — alerts below (not posted):\n" + content);
    return;
  }

  const res = await fetchWithTimeout(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord webhook returned HTTP ${res.status}`);
  console.log(`Posted ${alerts.length} economic alert(s) to Discord.`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
