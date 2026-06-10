export type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  {
    timeoutMs = 8000,
    retries = 1,
    retryDelayMs = 250,
    ...init
  }: FetchJsonOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      if (!res.ok) {
        throw new HttpError(
          `Request failed: ${res.status} ${res.statusText ?? ""}`.trim(),
          res.status,
        );
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      const retryable =
        !(error instanceof HttpError) ||
        RETRYABLE_STATUSES.has(error.status);
      if (!retryable || attempt === retries) throw error;
      await delay(Math.min(retryDelayMs * 2 ** attempt, 5000));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}
