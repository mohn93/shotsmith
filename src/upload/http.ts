export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface HttpRequest { method: Method; url: string; headers?: Record<string, string>; body?: string | Uint8Array }
export interface HttpResponse { status: number; text: string; headers?: Record<string, string> }
// Every store call goes through a Transport, so tests replace the network with a fake store.
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport = (timeoutMs = 120_000): Transport => async (req) => {
  try {
    // Stores never redirect these calls, and following one would re-send file bytes to another host.
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | undefined, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, text: await r.text(), headers: Object.fromEntries(r.headers.entries()) };
  } catch (e) {
    throw transportError(req, e, timeoutMs);
  }
};

interface Reason { message?: string; code?: string; errors?: Reason[] }

// A connect failure to a host with several addresses has an AggregateError cause with an empty message, so fall back
// to its code, then to the first address that says anything.
function reasonOf(c: Reason | undefined): string {
  if (!c) return "";
  return c.message || c.code || (c.errors ?? []).map(reasonOf).find(Boolean) || "";
}

// Names the call (without its query string) and the reason; fetch itself says only "fetch failed".
function transportError(req: HttpRequest, e: unknown, timeoutMs: number): Error {
  const u = new URL(req.url);
  const call = `${req.method} ${u.origin}${u.pathname}`;
  const err = e as { name?: string; message?: string; cause?: Reason };
  const cause = reasonOf(err.cause) || err.message || String(e);
  if (err.name === "TimeoutError") return new Error(`${call} timed out after ${timeoutMs / 1000} s`);
  if (/redirect/i.test(cause)) return new Error(`${call} answered with a redirect; Shotsmith does not follow redirects for store calls`);
  return new Error(`${call} failed: ${cause}`);
}

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

// The body of a store answer. An error status may come with a body that is not JSON (a proxy's HTML page); it is
// returned as { rawBody } with its first 200 characters, so the caller can still raise a StoreError.
export function parseBody(r: HttpResponse, from: string): Record<string, any> {
  if (r.status < 400) return parseJson(r.text, from);
  try {
    const data = parseJson(r.text, from);
    if (data !== null && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {}
  return { rawBody: r.text.slice(0, 200) };
}

// Store APIs answer JSON, or nothing (204).
export function parseJson(text: string, from: string): Record<string, any> {
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new Error(`${from} answered with something that is not JSON: ${text.slice(0, 200)}`); }
}
