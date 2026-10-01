export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface HttpRequest { method: Method; url: string; headers?: Record<string, string>; body?: string | Uint8Array }
export interface HttpResponse { status: number; text: string }
// Every store call goes through a Transport, so tests replace the network with a fake store.
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport = (timeoutMs = 120_000): Transport => async (req) => {
  const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | undefined, signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, text: await r.text() };
};

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
