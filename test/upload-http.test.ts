import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AscClient } from "../src/upload/apple.js";
import { type HttpRequest, type HttpResponse, type Method, StoreError, type Transport, fetchTransport, retrying } from "../src/upload/http.js";
import { PlayClient } from "../src/upload/play.js";

// Answers with the scripted responses in order and records the waits.
function scripted(...answers: HttpResponse[]) {
  const calls: HttpRequest[] = [];
  const sleeps: number[] = [];
  const transport = retrying(async (req) => { calls.push(req); return answers[Math.min(calls.length, answers.length) - 1]; }, async (ms) => { sleeps.push(ms); });
  const send = (method: Method) => transport({ method, url: "https://x.example/a" });
  return { calls, sleeps, send };
}
const res = (status: number, headers?: Record<string, string>): HttpResponse => ({ status, text: "", headers });

describe("retrying", () => {
  it("retries a GET after a 503, waiting 2 seconds", async () => {
    const t = scripted(res(503), res(200));
    expect((await t.send("GET")).status).toBe(200);
    expect(t.calls).toHaveLength(2);
    expect(t.sleeps).toEqual([2000]);
  });

  it("retries a 429 on a POST after Retry-After seconds", async () => {
    const t = scripted(res(429, { "retry-after": "3" }), res(200));
    expect((await t.send("POST")).status).toBe(200);
    expect(t.sleeps).toEqual([3000]);
  });

  it("does not retry a 5xx on POST or PATCH", async () => {
    for (const method of ["POST", "PATCH"] as const) {
      const t = scripted(res(503), res(200));
      expect((await t.send(method)).status).toBe(503);
      expect(t.calls).toHaveLength(1);
      expect(t.sleeps).toEqual([]);
    }
  });

  it("retries 5xx on PUT and DELETE", async () => {
    for (const method of ["PUT", "DELETE"] as const) {
      const t = scripted(res(502), res(204));
      expect((await t.send(method)).status).toBe(204);
    }
  });

  it("gives up after four attempts, backing off 2, 4 and 8 seconds", async () => {
    const t = scripted(res(500), res(500), res(500), res(500), res(200));
    expect((await t.send("GET")).status).toBe(500);
    expect(t.calls).toHaveLength(4);
    expect(t.sleeps).toEqual([2000, 4000, 8000]);
  });

  it("caps Retry-After at 60 seconds", async () => {
    const t = scripted(res(429, { "retry-after": "999" }), res(200));
    await t.send("GET");
    expect(t.sleeps).toEqual([60_000]);
  });

  it("uses the backoff when Retry-After is not whole seconds, and passes other statuses through", async () => {
    const t = scripted(res(429, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }), res(404));
    expect((await t.send("GET")).status).toBe(404);
    expect(t.sleeps).toEqual([2000]);
  });

  it("does not retry a network error", async () => {
    let n = 0;
    const transport = retrying(async () => { n++; throw new Error("socket hang up"); }, async () => {});
    await expect(transport({ method: "GET", url: "https://x.example" })).rejects.toThrow(/socket hang up/);
    expect(n).toBe(1);
  });
});

const listen = async (server: http.Server) => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
};
const close = (server: http.Server) => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });

describe("fetchTransport errors", () => {
  it("names a call that timed out, without the query string", async () => {
    const server = http.createServer((req) => { req.resume(); });
    const port = await listen(server);
    try {
      const failure = fetchTransport(200)({ method: "GET", url: `http://127.0.0.1:${port}/slow?secret=1` });
      await expect(failure).rejects.toThrow(`GET http://127.0.0.1:${port}/slow timed out after 0.2 s`);
      await expect(failure).rejects.not.toThrow(/secret/);
    } finally {
      await close(server);
    }
  });

  it("names any other network failure with its cause", async () => {
    const server = http.createServer();
    const port = await listen(server);
    await close(server);
    const failure = fetchTransport()({ method: "POST", url: `http://127.0.0.1:${port}/x?token=1` });
    await expect(failure).rejects.toThrow(new RegExp(`^POST http://127\\.0\\.0\\.1:${port}/x failed: .*ECONNREFUSED`));
    await expect(failure).rejects.not.toThrow(/token/);
  });
});

describe("error statuses with a body that is not JSON", () => {
  const html = `<html>${"x".repeat(300)}</html>`;
  const answer = (status: number): Transport => async () => ({ status, text: html });

  it("still raise a StoreError with the status and the start of the body", async () => {
    const stores = [
      () => new AscClient({ transport: answer(502), token: () => "t" }).request("GET", "/v1/apps"),
      () => new PlayClient({ transport: answer(502), token: async () => "t" }, "com.example.demo").openEdit(),
    ];
    for (const start of stores) {
      const failure = start();
      await expect(failure).rejects.toBeInstanceOf(StoreError);
      await expect(failure).rejects.toMatchObject({ status: 502, message: expect.stringContaining(`(502): ${html.slice(0, 200)}`) });
      await expect(failure).rejects.not.toThrow(html.slice(0, 201));
    }
  });

  it("keep the not JSON error on a 2xx", async () => {
    await expect(new AscClient({ transport: answer(200), token: () => "t" }).request("GET", "/v1/apps")).rejects.toThrow(/App Store Connect answered with something that is not JSON/);
    await expect(new PlayClient({ transport: answer(200), token: async () => "t" }, "com.example.demo").openEdit()).rejects.toThrow(/Google Play answered with something that is not JSON/);
  });
});

describe("a JSON error body with a rawBody key", () => {
  const body = JSON.stringify({ rawBody: "<html>from the body</html>" });
  const answer: Transport = async () => ({ status: 500, text: body });

  it("is treated as JSON, so its key is not shown as the start of a page that is not JSON", async () => {
    for (const start of [
      () => new AscClient({ transport: answer, token: () => "t" }).request("GET", "/v1/apps"),
      () => new PlayClient({ transport: answer, token: async () => "t" }, "com.example.demo").openEdit(),
    ]) {
      const failure = start();
      await expect(failure).rejects.toBeInstanceOf(StoreError);
      await expect(failure).rejects.not.toThrow(/from the body/);
    }
  });

  it("is still read as the start of a body that is not JSON", () => {
    const asc = new AscClient({ transport: async () => ({ status: 500, text: "<html>proxy</html>" }), token: () => "t" });
    return expect(asc.request("GET", "/v1/apps")).rejects.toThrow("(500): <html>proxy</html>");
  });
});

describe("fetchTransport with a URL that does not parse", () => {
  it("names the call by the raw URL without its query, and keeps the failure", async () => {
    const failure = fetchTransport()({ method: "GET", url: "not a url?token=1#frag" });
    await expect(failure).rejects.toThrow(/^GET not a url failed: /);
    await expect(failure).rejects.not.toThrow(/token|frag/);
  });
});

describe("fetchTransport on a host with several addresses", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("gives a reason when the cause is an AggregateError with an empty message", async () => {
    const each = Object.assign(new Error("connect ECONNREFUSED ::1:1"), { code: "ECONNREFUSED" });
    const cause = Object.assign(new AggregateError([each], ""), { code: "ECONNREFUSED" });
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed", { cause }); });
    await expect(fetchTransport()({ method: "GET", url: "https://api.example.test/v1/apps?x=1" })).rejects.toThrow(/^GET https:\/\/api\.example\.test\/v1\/apps failed: (ECONNREFUSED|connect ECONNREFUSED)/);
    // Without a code on the aggregate, the first address that says something is used.
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed", { cause: new AggregateError([each], "") }); });
    await expect(fetchTransport()({ method: "GET", url: "https://api.example.test/v1/apps" })).rejects.toThrow(/failed: connect ECONNREFUSED ::1:1$/);
  });
});
