// Live-wallet smoke test helper (read-only, mainnet-safe).
//
// Prints a labeled snapshot of all on-chain state relevant to the MINT path for
// one wallet + one game. Run it BEFORE and AFTER you mint from the browser, then
// diff the two blocks against the expected deltas in
// docs/superpowers/checklists/2026-06-13-live-wallet-smoke-test.md
//
// Usage:
//   node scripts/smoke-snapshot.mjs <stx-address> [game] [tokenId]
//     <stx-address>  wallet you will mint from (required)
//     [game]         snake|tetris|pacman|bricks|minesweeper (default: snake)
//     [tokenId]      optional: also resolve owner + metadata for this token id
//
// This script never signs or broadcasts anything. It only reads.

import {
  cvToValue,
  fetchCallReadOnlyFunction,
  principalCV,
  uintCV,
} from "@stacks/transactions";

const APP_URL = (
  process.env.PRODUCTION_APP_URL ?? "https://xp-snake.vercel.app"
).replace(/\/$/, "");
const API_URL = (
  process.env.STACKS_API_URL ?? "https://api.hiro.so"
).replace(/\/$/, "");
const CONTRACT_ADDRESS = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const CONTRACT_NAME = "xp-arcade-v4";

const GAME_IDS = {
  snake: 1,
  tetris: 2,
  pacman: 3,
  bricks: 4,
  minesweeper: 5,
};

const [address, gameArg = "snake", tokenIdArg] = process.argv.slice(2);

if (!address || !/^SP[0-9A-Z]+$/.test(address)) {
  console.error(
    "Usage: node scripts/smoke-snapshot.mjs <SP... address> [game] [tokenId]",
  );
  process.exit(1);
}
const gameId = GAME_IDS[gameArg];
if (!gameId) {
  console.error(
    `Unknown game "${gameArg}". Expected one of: ${Object.keys(GAME_IDS).join(", ")}`,
  );
  process.exit(1);
}

function fetchWithTimeout(input, init = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
}

// cvToValue in this @stacks/transactions version returns nested { type, value }
// wrappers rather than plain JS. unwrap() recursively collapses them to plain
// values: uint/principal -> string, tuple -> object, list -> array,
// optional none -> null. It is idempotent on already-plain values.
function unwrap(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(unwrap);
  if (typeof v === "object") {
    if ("type" in v && "value" in v) {
      const t = String(v.type);
      if (t.startsWith("(optional")) return v.value == null ? null : unwrap(v.value);
      if (
        t.startsWith("(list") ||
        t.startsWith("(tuple") ||
        t.startsWith("(response")
      ) {
        return unwrap(v.value);
      }
      return v.value; // uint/int/principal/bool/string primitive
    }
    const o = {};
    for (const k of Object.keys(v)) o[k] = unwrap(v[k]);
    return o;
  }
  return v;
}

async function readOnly(functionName, functionArgs = []) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: address,
    network: "mainnet",
    client: { baseUrl: API_URL, fetch: fetchWithTimeout },
  });
  return unwrap(cvToValue(result, true));
}

async function stxBalance(principal) {
  const res = await fetchWithTimeout(
    `${API_URL}/extended/v1/address/${principal}/balances`,
  );
  if (!res.ok) throw new Error(`balances HTTP ${res.status}`);
  const json = await res.json();
  return BigInt(json.stx?.balance ?? "0");
}

function num(v) {
  return v === null || v === undefined ? null : Number(v);
}

async function main() {
  const stamp = new Date().toISOString();
  console.log(`================= SMOKE SNAPSHOT =================`);
  console.log(`time      : ${stamp}`);
  console.log(`address   : ${address}`);
  console.log(`game      : ${gameArg} (id ${gameId})`);
  console.log(`contract  : ${CONTRACT_ADDRESS}.${CONTRACT_NAME}`);

  const [
    lastTokenId,
    game,
    season,
    pool,
    endBlock,
    topTen,
    best,
    mintsRemaining,
    balance,
  ] = await Promise.all([
    readOnly("get-last-token-id"),
    readOnly("get-game", [uintCV(gameId)]),
    readOnly("get-current-season", [uintCV(gameId)]),
    readOnly("get-prize-pool-balance", [uintCV(gameId)]),
    readOnly("get-season-end-block", [uintCV(gameId)]),
    readOnly("get-top-ten", [uintCV(gameId)]),
    readOnly("get-best-score", [uintCV(gameId), principalCV(address)]),
    readOnly("get-mints-remaining", [uintCV(gameId), principalCV(address)]),
    stxBalance(address),
  ]);

  const mintFee = game && game.fee !== undefined ? num(game.fee) : null;

  console.log(`-------------------------------------------------`);
  console.log(`last-token-id        : ${num(lastTokenId)}`);
  console.log(`current-season       : ${num(season)}`);
  console.log(`season-end-block     : ${num(endBlock)}`);
  console.log(`prize-pool (uSTX)    : ${num(pool)}`);
  console.log(`mint-fee (uSTX)      : ${mintFee ?? "unknown"}`);
  console.log(`mints-remaining (you): ${num(mintsRemaining)}`);
  console.log(`wallet STX (uSTX)    : ${balance.toString()}`);

  // best-score is an optional tuple: { score, token-id, season } | null
  if (best) {
    console.log(
      `your best-score      : score=${num(best.score)} token-id=${num(
        best["token-id"],
      )} season=${num(best.season)}`,
    );
  } else {
    console.log(`your best-score      : (none yet)`);
  }

  // top-ten is a list of { player, score }
  const rows = Array.isArray(topTen) ? topTen : [];
  console.log(`top-ten size         : ${rows.length}`);
  const sorted = [...rows]
    .map((r) => ({ player: r.player, score: num(r.score) }))
    .sort((a, b) => b.score - a.score);
  sorted.forEach((r, i) => {
    const you = r.player === address ? "  <-- YOU" : "";
    console.log(`  #${i + 1} ${r.player} = ${r.score}${you}`);
  });
  if (!sorted.some((r) => r.player === address)) {
    console.log(`  (your address is not in the top-ten)`);
  }

  // Optional: resolve a specific token id (owner + metadata).
  if (tokenIdArg) {
    const tid = Number(tokenIdArg);
    console.log(`-------------------------------------------------`);
    console.log(`token #${tid}:`);
    try {
      const owner = await readOnly("get-owner", [uintCV(tid)]);
      console.log(`  on-chain owner     : ${owner ?? "(none)"}`);
    } catch (e) {
      console.log(`  on-chain owner     : ERROR ${e.message}`);
    }
    try {
      const res = await fetchWithTimeout(
        `${APP_URL}/api/metadata/score/${tid}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      const attrs = Object.fromEntries(
        (meta.attributes ?? []).map((a) => [a.trait_type, a.value]),
      );
      console.log(`  metadata name      : ${meta.name}`);
      console.log(`  metadata image     : ${meta.image ? "present" : "MISSING"}`);
      console.log(
        `  attrs              : Score=${attrs.Score} Game=${attrs.Game} Season=${attrs.Season} Rarity=${attrs.Rarity}`,
      );
    } catch (e) {
      console.log(`  metadata           : ERROR ${e.message}`);
    }
  }
  console.log(`=================================================`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
