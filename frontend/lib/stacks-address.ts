const MAINNET_RE = /^SP[0-9A-HJKMNP-TV-Z]{38,40}$/;
const TESTNET_RE = /^ST[0-9A-HJKMNP-TV-Z]{38,40}$/;

export function isStacksAddress(input: string): boolean {
  return MAINNET_RE.test(input) || TESTNET_RE.test(input);
}

export function shortAddress(addr: string, head = 5, tail = 4): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
