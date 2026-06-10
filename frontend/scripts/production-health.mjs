import {
  cvToValue,
  fetchCallReadOnlyFunction,
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
const CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
const OWNER = CONTRACT_ADDRESS;
const GAMES = [
  ["snake", 1],
  ["tetris", 2],
  ["pacman", 3],
  ["bricks", 4],
];

function fetchWithTimeout(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function readOnly(functionName, functionArgs = []) {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: OWNER,
    network: "mainnet",
    client: {
      baseUrl: API_URL,
      fetch: fetchWithTimeout,
    },
  });
  return cvToValue(result);
}

async function check(name, operation) {
  const startedAt = Date.now();
  const detail = await operation();
  console.log(`PASS ${name} (${Date.now() - startedAt}ms)${detail ? `: ${detail}` : ""}`);
}

async function main() {
  console.log(`Production health check: ${APP_URL}`);

  await check("frontend configuration", async () => {
    const health = await fetchJson(`${APP_URL}/api/health`);
    if (health.status !== "ok") throw new Error("health status is not ok");
    if (health.network !== "mainnet") {
      throw new Error(`expected mainnet, received ${health.network}`);
    }
    if (health.contractId !== CONTRACT_ID) {
      throw new Error(
        `expected ${CONTRACT_ID}, received ${health.contractId}`,
      );
    }
    return health.contractId;
  });

  await check("metadata token 1", async () => {
    const metadata = await fetchJson(`${APP_URL}/api/metadata/score/1`);
    if (typeof metadata.name !== "string" || !metadata.name) {
      throw new Error("metadata name is missing");
    }
    if (typeof metadata.image !== "string" || !metadata.image) {
      throw new Error("metadata image is missing");
    }
    return metadata.name;
  });

  await check("contract owner", async () => {
    const owner = String(await readOnly("get-contract-owner"));
    if (owner !== OWNER) {
      throw new Error(`expected ${OWNER}, received ${owner}`);
    }
    return owner;
  });

  for (const [name, gameId] of GAMES) {
    await check(`${name} chain reads`, async () => {
      const [season, pool, topTen, endBlock] = await Promise.all([
        readOnly("get-current-season", [uintCV(gameId)]),
        readOnly("get-prize-pool-balance", [uintCV(gameId)]),
        readOnly("get-top-ten", [uintCV(gameId)]),
        readOnly("get-season-end-block", [uintCV(gameId)]),
      ]);
      if (Number(season) < 1) throw new Error("invalid current season");
      if (Number(pool) < 0) throw new Error("invalid prize pool");
      if (!Array.isArray(topTen) || topTen.length > 10) {
        throw new Error("invalid top-ten response");
      }
      return `season=${season} pool=${pool} topTen=${topTen.length} endBlock=${endBlock}`;
    });
  }
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
