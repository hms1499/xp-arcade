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
}

export const GAMES: Record<GameId, GameDef> = {
  snake: {
    id: "snake",
    label: "Snake",
    emoji: "🐍",
    contractAddress: DEPLOYER,
    contractName: "snake-score",
    mintFeeUstx: BigInt(10_000),
    metaSegment: "score",
  },
  tetris: {
    id: "tetris",
    label: "Tetris",
    emoji: "🧱",
    contractAddress: DEPLOYER,
    contractName: "tetris-score",
    mintFeeUstx: BigInt(20_000),
    metaSegment: "tetris",
  },
  pacman: {
    id: "pacman",
    label: "Pac-Man",
    emoji: "👾",
    contractAddress: DEPLOYER,
    contractName: "pacman-score",
    mintFeeUstx: BigInt(20_000),
    metaSegment: "pacman",
  },
};
