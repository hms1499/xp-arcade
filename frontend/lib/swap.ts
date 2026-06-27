"use client";
import {
  BitflowSDK,
  type BitflowSDKConfig,
  type QuoteResult,
} from "@bitflowlabs/core-sdk";
import { tokensForDirection, type Direction } from "./swap-tokens";
import { slippageBpsToTolerance } from "./swap-math";

// Bitflow's public API gateway. No API key required — endpoints are public
// (500 req/min per IP), and these calls run client-side so the limit is
// effectively per-user. The SDK's own baked default points at a dead TEST
// gateway, so we always supply a working host here.
const DEFAULT_API_HOST = "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev";

// Build the SDK config, omitting any key we don't have a value for. The SDK
// does `Object.assign(defaults, config)`, so passing an explicit `undefined`
// would clobber its built-in defaults — only include keys that are actually set.
function readConfig(): BitflowSDKConfig {
  const cfg: BitflowSDKConfig = {
    BITFLOW_API_HOST: process.env.NEXT_PUBLIC_BITFLOW_API_HOST || DEFAULT_API_HOST,
  };
  const provider = process.env.NEXT_PUBLIC_BITFLOW_PROVIDER_ADDRESS;
  if (provider) cfg.BITFLOW_PROVIDER_ADDRESS = provider;
  const readonlyHost = process.env.NEXT_PUBLIC_BITFLOW_READONLY_HOST;
  if (readonlyHost) cfg.READONLY_CALL_API_HOST = readonlyHost;
  return cfg;
}

let client: BitflowSDK | null = null;
export function getSwapClient(): BitflowSDK {
  if (!client) client = new BitflowSDK(readConfig());
  return client;
}

// Bitflow's non-null RouteQuote; its `.route` is handed back to executeSwap.
type BestRoute = NonNullable<QuoteResult["bestRoute"]>;

export type SwapQuote = {
  amountOut: number; // human units of tokenY
  rate: number;      // tokenY per 1 tokenX
  route: BestRoute["route"]; // opaque SelectedSwapRoute for executeSwap
  tokenXDecimals: number;
  tokenYDecimals: number;
  ts: number;        // Date.now() at fetch time (staleness)
};

export async function getQuote(
  direction: Direction,
  amountIn: number,
): Promise<SwapQuote> {
  const { tokenX, tokenY } = tokensForDirection(direction);
  const res = await getSwapClient().getQuoteForRoute(tokenX.id, tokenY.id, amountIn);
  const best = res.bestRoute;
  if (!best || best.quote == null) {
    throw new Error("No route found for this pair and amount");
  }
  return {
    amountOut: best.quote,
    rate: amountIn > 0 ? best.quote / amountIn : 0,
    route: best.route,
    tokenXDecimals: best.tokenXDecimals,
    tokenYDecimals: best.tokenYDecimals,
    ts: Date.now(),
  };
}

export type SwapCallbacks = {
  onSuccess: (txId: string) => void;
  onCancel: () => void;
};

export async function executeSwap(
  quote: SwapQuote,
  amountIn: number,
  senderAddress: string,
  slippageBps: number,
  cb: SwapCallbacks,
): Promise<void> {
  await getSwapClient().executeSwap(
    {
      route: quote.route,
      amount: amountIn,
      tokenXDecimals: quote.tokenXDecimals,
      tokenYDecimals: quote.tokenYDecimals,
    },
    senderAddress,
    slippageBpsToTolerance(slippageBps),
    // stacksProvider omitted (optional): the SDK loads its own @stacks/connect
    // integration. Task 9 smoke test confirms the connected wallet is used.
    undefined,
    (data: { txId: string }) => cb.onSuccess(data.txId),
    cb.onCancel,
  );
}
