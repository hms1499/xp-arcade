// frontend/lib/browserbase.ts
import "server-only";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

const SESSION_TIMEOUT_S = 300;

function apiKey(): string | undefined {
  return process.env.BROWSERBASE_API_KEY;
}
function projectId(): string | undefined {
  return process.env.BROWSERBASE_PROJECT_ID;
}

/** Both required env vars present. When false, callers must degrade. */
export function isConfigured(): boolean {
  return Boolean(apiKey() && projectId());
}

function client(): Browserbase {
  return new Browserbase({ apiKey: apiKey()! });
}

/** Reconstruct the CDP URL server-side — it embeds the API key, so it must
 * never be returned to the client. */
function connectUrl(sessionId: string): string {
  return `wss://connect.browserbase.com?apiKey=${apiKey()}&sessionId=${sessionId}`;
}

export async function createSession(): Promise<{ sessionId: string; liveViewUrl: string }> {
  const bb = client();
  const session = await bb.sessions.create({
    projectId: projectId()!,
    keepAlive: true,
    timeout: SESSION_TIMEOUT_S,
  });
  const debug = await bb.sessions.debug(session.id);
  return { sessionId: session.id, liveViewUrl: debug.debuggerFullscreenUrl };
}

export async function navigate(sessionId: string, url: string): Promise<{ title: string }> {
  const browser = await chromium.connectOverCDP(connectUrl(sessionId));
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { title: await page.title() };
  } finally {
    // Disconnect the CDP client; keepAlive keeps the remote session alive.
    await browser.close();
  }
}

export async function endSession(sessionId: string): Promise<void> {
  const bb = client();
  await bb.sessions.update(sessionId, {
    projectId: projectId()!,
    status: "REQUEST_RELEASE",
  });
}
