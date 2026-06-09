export type GameId = "snake" | "tetris" | "pacman" | "breakout";
export type NetworkName = "mainnet" | "testnet";

export interface GameDef {
  id: GameId;
  label: string;
  emoji: string;
  onchainId: number;
  contractAddress: string;
  contractName: string;
  mintFeeUstx: bigint;
  metaSegment: string;
  nftAssetName: string;
}

type GameConfig = Omit<GameDef, "id" | "label" | "emoji" | "onchainId" | "mintFeeUstx" | "metaSegment" | "nftAssetName">;

const MAINNET_DEPLOYER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const V4_CONTRACT_NAME = "xp-arcade-v4";

const GAME_METADATA: Record<
  GameId,
  Pick<GameDef, "id" | "label" | "emoji" | "onchainId" | "mintFeeUstx" | "metaSegment" | "nftAssetName">
> = {
  snake:    { id: "snake",    label: "Snake",     emoji: "🐍", onchainId: 1, mintFeeUstx: BigInt(10_000), metaSegment: "score",    nftAssetName: "xp-score" },
  tetris:   { id: "tetris",   label: "Tetris",    emoji: "🧱", onchainId: 2, mintFeeUstx: BigInt(20_000), metaSegment: "tetris",   nftAssetName: "xp-score" },
  pacman:   { id: "pacman",   label: "Pac-Man",   emoji: "👾", onchainId: 3, mintFeeUstx: BigInt(20_000), metaSegment: "pacman",   nftAssetName: "xp-score" },
  breakout: { id: "breakout", label: "XP Bricks", emoji: "🏓", onchainId: 4, mintFeeUstx: BigInt(20_000), metaSegment: "breakout", nftAssetName: "xp-score" },
};

const SHARED_V4: GameConfig = { contractAddress: MAINNET_DEPLOYER, contractName: V4_CONTRACT_NAME };

const GAME_CONTRACTS: Record<NetworkName, Record<GameId, GameConfig>> = {
  mainnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4 },
  testnet: { snake: SHARED_V4, tetris: SHARED_V4, pacman: SHARED_V4, breakout: SHARED_V4 },
};

export const GAME_IDS: GameId[] = ["snake", "tetris", "pacman", "breakout"];

export function parseRegistryNetwork(value: string | undefined): NetworkName {
  if (value === "mainnet" || value === "testnet") return value;
  if (value == null || value === "") return "mainnet";
  throw new Error(`Invalid NEXT_PUBLIC_NETWORK: ${value}`);
}

function buildGameRegistry(networkName: NetworkName): Record<GameId, GameDef> {
  const contracts = GAME_CONTRACTS[networkName];
  return validateGameRegistry({
    snake: { ...GAME_METADATA.snake, ...contracts.snake },
    tetris: { ...GAME_METADATA.tetris, ...contracts.tetris },
    pacman: { ...GAME_METADATA.pacman, ...contracts.pacman },
    breakout: { ...GAME_METADATA.breakout, ...contracts.breakout },
  });
}

export function validateGameDef(game: GameDef): GameDef {
  if (!GAME_IDS.includes(game.id)) {
    throw new Error(`Invalid game id: ${game.id}`);
  }
  if (!game.contractAddress || !/^(SP|ST)[A-Z0-9]+$/.test(game.contractAddress)) {
    throw new Error(`Invalid ${game.id} contract address`);
  }
  if (!game.contractName || !/^[a-zA-Z]([a-zA-Z0-9-])*[a-zA-Z0-9]$/.test(game.contractName)) {
    throw new Error(`Invalid ${game.id} contract name`);
  }
  if (game.mintFeeUstx <= BigInt(0)) {
    throw new Error(`Invalid ${game.id} mint fee`);
  }
  if (!game.metaSegment || !/^[a-z0-9-]+$/.test(game.metaSegment)) {
    throw new Error(`Invalid ${game.id} metadata segment`);
  }
  if (!game.nftAssetName || !/^[a-zA-Z]([a-zA-Z0-9-])*[a-zA-Z0-9]$/.test(game.nftAssetName)) {
    throw new Error(`Invalid ${game.id} NFT asset name`);
  }
  if (!Number.isInteger(game.onchainId) || game.onchainId <= 0) {
    throw new Error(`Invalid ${game.id} onchain id`);
  }
  return game;
}

export function validateGameRegistry(games: Record<GameId, GameDef>): Record<GameId, GameDef> {
  for (const id of GAME_IDS) {
    if (games[id].id !== id) throw new Error(`Game registry key mismatch: ${id}`);
    validateGameDef(games[id]);
  }
  return games;
}

export const NETWORK_NAME = parseRegistryNetwork(process.env.NEXT_PUBLIC_NETWORK);
export const GAMES: Record<GameId, GameDef> = buildGameRegistry(NETWORK_NAME);

export function expectedPrimaryContractId(games: Record<GameId, GameDef> = GAMES): string {
  return `${games.snake.contractAddress}.${games.snake.contractName}`;
}

export function onchainIdFor(gameId: GameId): number {
  return GAMES[gameId].onchainId;
}

export function gameIdFromOnchainOrNull(n: number): GameId | null {
  return GAME_IDS.find((id) => GAMES[id].onchainId === n) ?? null;
}

export function gameIdFromOnchain(n: number): GameId {
  const found = gameIdFromOnchainOrNull(n);
  if (!found) throw new Error(`Unknown onchain id: ${n}`);
  return found;
}
