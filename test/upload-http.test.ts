import { describe, expect, it } from "vitest";
import { type HttpRequest, type HttpResponse, type Method, retrying } from "../src/upload/http.js";

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
