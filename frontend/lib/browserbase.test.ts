// frontend/lib/browserbase.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const debugMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const connectOverCDPMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@browserbasehq/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    sessions: { create: createMock, debug: debugMock, update: updateMock },
  })),
}));
vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: connectOverCDPMock },
}));

import { isConfigured, createSession, navigate, endSession } from "./browserbase";

beforeEach(() => {
  vi.stubEnv("BROWSERBASE_API_KEY", "test-key");
  vi.stubEnv("BROWSERBASE_PROJECT_ID", "proj-1");
  createMock.mockReset();
  debugMock.mockReset();
  updateMock.mockReset();
  connectOverCDPMock.mockReset();
});

describe("isConfigured", () => {
  it("is true when both env vars are set", () => {
    expect(isConfigured()).toBe(true);
  });
  it("is false when the api key is missing", () => {
    vi.stubEnv("BROWSERBASE_API_KEY", "");
    expect(isConfigured()).toBe(false);
  });
});

describe("createSession", () => {
  it("creates a keepAlive session and returns the fullscreen live view url", async () => {
    createMock.mockResolvedValue({ id: "sess_1" });
    debugMock.mockResolvedValue({ debuggerFullscreenUrl: "https://debugger/sess_1/fullscreen" });
    const result = await createSession();
    expect(createMock).toHaveBeenCalledWith({
      projectId: "proj-1",
      keepAlive: true,
      timeout: 300,
    });
    expect(result).toEqual({
      sessionId: "sess_1",
      liveViewUrl: "https://debugger/sess_1/fullscreen",
    });
  });
});

describe("navigate", () => {
  it("connects over CDP, navigates, returns the title, and closes", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const title = vi.fn().mockResolvedValue("Example");
    const close = vi.fn().mockResolvedValue(undefined);
    const page = { goto, title };
    const browser = {
      contexts: () => [{ pages: () => [page], newPage: vi.fn() }],
      close,
    };
    connectOverCDPMock.mockResolvedValue(browser);

    const result = await navigate("sess_1", "https://example.com/");

    const connectArg = connectOverCDPMock.mock.calls[0][0] as string;
    expect(connectArg).toContain("sessionId=sess_1");
    expect(goto).toHaveBeenCalledWith("https://example.com/", { waitUntil: "domcontentloaded" });
    expect(close).toHaveBeenCalled();
    expect(result).toEqual({ title: "Example" });
  });

  it("does not leak the api key in its return value", async () => {
    const browser = {
      contexts: () => [{ pages: () => [{ goto: vi.fn(), title: vi.fn().mockResolvedValue("x") }], newPage: vi.fn() }],
      close: vi.fn(),
    };
    connectOverCDPMock.mockResolvedValue(browser);
    const result = await navigate("sess_1", "https://example.com/");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
});

describe("endSession", () => {
  it("requests release with the project id", async () => {
    updateMock.mockResolvedValue(undefined);
    await endSession("sess_1");
    expect(updateMock).toHaveBeenCalledWith("sess_1", {
      projectId: "proj-1",
      status: "REQUEST_RELEASE",
    });
  });
});
