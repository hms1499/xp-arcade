import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const network =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;

const fullId = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? ".";
const [contractAddress, contractName] = fullId.split(".");

export const stacks = {
  network,
  contractAddress,
  contractName,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
