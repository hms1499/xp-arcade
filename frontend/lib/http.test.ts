import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError } from "./http";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("returns parsed JSON for a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ value: 42 }),
      })),
    );

    await expect(fetchJson<{ value: number }>("/ok")).resolves.toEqual({
      value: 42,
    });
  });

  it("retries transient HTTP errors", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      fetchJson("/flaky", { retries: 1, retryDelayMs: 0 }),
    ).resolves.toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a terminal 4xx response", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchJson("/missing", { retries: 3 })).rejects.toMatchObject({
      name: "HttpError",
      status: 404,
    } satisfies Partial<HttpError>);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("aborts a request that exceeds its timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );

    const request = expect(
      fetchJson("/slow", { timeoutMs: 20, retries: 0 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(20);
    await request;
  });
});
