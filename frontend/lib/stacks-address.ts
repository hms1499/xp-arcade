const MAINNET_RE = /^SP[0-9A-HJKMNP-TV-Z]{38,40}$/;
const TESTNET_RE = /^ST[0-9A-HJKMNP-TV-Z]{38,40}$/;

export function isStacksAddress(input: string): boolean {
  return MAINNET_RE.test(input) || TESTNET_RE.test(input);
}

/** The network a Stacks address belongs to, from its prefix, or null. */
export function addressNetwork(
  input: string | null | undefined,
): "mainnet" | "testnet" | null {
  if (!input) return null;
  if (MAINNET_RE.test(input)) return "mainnet";
  if (TESTNET_RE.test(input)) return "testnet";
  return null;
}

export function shortAddress(addr: string, head = 5, tail = 4): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
