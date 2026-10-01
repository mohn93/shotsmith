export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface HttpRequest { method: Method; url: string; headers?: Record<string, string>; body?: string | Uint8Array }
export interface HttpResponse { status: number; text: string; headers?: Record<string, string> }
// Every store call goes through a Transport, so tests replace the network with a fake store.
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport = (timeoutMs = 120_000): Transport => async (req) => {
  // Stores never redirect these calls, and following one would re-send file bytes to another host.
  const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | undefined, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, text: await r.text(), headers: Object.fromEntries(r.headers.entries()) };
};

const RETRY_5XX: Method[] = ["GET", "PUT", "DELETE"];
const ATTEMPTS = 4;

// Retries rate limits (any method) and server errors (only calls that are safe to repeat: a POST or PATCH may have
// taken effect). Waits Retry-After seconds, up to 60, else 2, 4 and 8 seconds. Network errors are not retried.
export function retrying(transport: Transport, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Transport {
  return async (req) => {
    for (let attempt = 1; ; attempt++) {
      const r = await transport(req);
      const retry = r.status === 429 || ([500, 502, 503, 504].includes(r.status) && RETRY_5XX.includes(req.method));
      if (!retry || attempt >= ATTEMPTS) return r;
      const after = r.headers?.["retry-after"]?.trim();
      await sleep(after && /^\d+$/.test(after) ? Math.min(Number(after), 60) * 1000 : 2000 * 2 ** (attempt - 1));
    }
  };
}

// A store answered with an error status. The message says what to do about it.
export class StoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "StoreError";
  }
}

// Store APIs answer JSON, or nothing (204).
export function parseJson(text: string, from: string): Record<string, any> {
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new Error(`${from} answered with something that is not JSON: ${text.slice(0, 200)}`); }
}
