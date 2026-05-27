import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";
import {
  expectedPrimaryContractId,
  parseRegistryNetwork,
  type NetworkName,
} from "./game-registry";

export type ContractIdParts = {
  contractAddress: string;
  contractName: string;
};

export function parseNetworkName(value: string | undefined): NetworkName {
  return parseRegistryNetwork(value);
}

export function parseContractId(
  value: string | undefined,
  expectedContractId = expectedPrimaryContractId(),
): ContractIdParts {
  const fullId = value == null || value === "" ? expectedContractId : value;
  const parts = fullId.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS must use ADDRESS.contract-name format");
  }
  const [contractAddress, contractName] = parts;
  if (!/^(SP|ST)[A-Z0-9]+$/.test(contractAddress)) {
    throw new Error(`Invalid contract address in NEXT_PUBLIC_CONTRACT_ADDRESS: ${contractAddress}`);
  }
  if (!/^[a-zA-Z]([a-zA-Z0-9-])*[a-zA-Z0-9]$/.test(contractName)) {
    throw new Error(`Invalid contract name in NEXT_PUBLIC_CONTRACT_ADDRESS: ${contractName}`);
  }
  if (fullId !== expectedContractId) {
    throw new Error(
      `NEXT_PUBLIC_CONTRACT_ADDRESS (${fullId}) must match configured Snake contract (${expectedContractId})`,
    );
  }
  return { contractAddress, contractName };
}

const networkName = parseNetworkName(process.env.NEXT_PUBLIC_NETWORK);
const network = networkName === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
const { contractAddress, contractName } = parseContractId(
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
);

export const stacks = {
  networkName,
  network,
  contractAddress,
  contractName,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
