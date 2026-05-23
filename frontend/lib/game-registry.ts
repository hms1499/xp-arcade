const DEPLOYER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";

export type GameId = "snake" | "tetris" | "pacman";

export interface GameDef {
  id: GameId;
  label: string;
  emoji: string;
  contractAddress: string;
  contractName: string;
  mintFeeUstx: bigint;
  metaSegment: string;
  nftAssetName: string;
}

const GAME_DEFS: Record<GameId, GameDef> = {
  snake: {
    id: "snake",
    label: "Snake",
    emoji: "🐍",
    contractAddress: DEPLOYER,
    contractName: "snake-score-v2",
    mintFeeUstx: BigInt(10_000),
    metaSegment: "score",
    nftAssetName: "snake-score",
  },
  tetris: {
    id: "tetris",
    label: "Tetris",
    emoji: "🧱",
    contractAddress: DEPLOYER,
    contractName: "tetris-score-v2",
    mintFeeUstx: BigInt(20_000),
    metaSegment: "tetris",
    nftAssetName: "tetris-score",
  },
  pacman: {
    id: "pacman",
    label: "Pac-Man",
    emoji: "👾",
    contractAddress: DEPLOYER,
    contractName: "pacman-score-v2",
    mintFeeUstx: BigInt(20_000),
    metaSegment: "pacman",
    nftAssetName: "pacman-score",
  },
};

const GAME_IDS: GameId[] = ["snake", "tetris", "pacman"];

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
  return game;
}

function validateGameRegistry(games: Record<GameId, GameDef>): Record<GameId, GameDef> {
  for (const id of GAME_IDS) {
    if (games[id].id !== id) throw new Error(`Game registry key mismatch: ${id}`);
    validateGameDef(games[id]);
  }
  return games;
}

export const GAMES: Record<GameId, GameDef> = validateGameRegistry(GAME_DEFS);
