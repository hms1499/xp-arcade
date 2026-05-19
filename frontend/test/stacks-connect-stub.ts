// Test-only stub for `@stacks/connect`.
//
// `@stacks/connect` eagerly `require`s `@stacks/connect-ui`, whose Stencil
// runtime bundle crashes when evaluated under jsdom (it expects a real
// browser). Importing `state/wallet.ts` in a unit test would therefore blow
// up before any test runs. This stub provides just the surface our code
// touches (`wallet.ts` + `contract-calls.ts`) with inert implementations.

export function connect(): Promise<void> {
  return Promise.resolve();
}

export function disconnect(): void {}

export function isConnected(): boolean {
  return false;
}

export function getLocalStorage(): null {
  return null;
}

export function openContractCall(): void {}

export function openSTXTransfer(): void {}
