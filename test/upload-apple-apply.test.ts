import { beforeEach, describe, expect, it } from "vitest";
import { type AppleDeps, applyApple, planApple } from "../src/upload/apple.js";
import { type LocalSet, localSets } from "../src/upload/local.js";
import { FakeAsc } from "./upload/fake-asc.js";
import { uploadWorkspace } from "./upload/workspace.js";

let clock = 0;
beforeEach(() => { clock = 0; });
const deps = (fake: FakeAsc): AppleDeps => ({ transport: fake.transport, token: () => "token", now: () => clock, sleep: async (ms) => { clock += ms; } });

async function planned(prep?: (fake: FakeAsc, sets: LocalSet[]) => void) {
  const cfg = await uploadWorkspace();
  const { sets } = await localSets(cfg, "apple");
  const fake = new FakeAsc();
  prep?.(fake, sets);
  const { plan } = await planApple(cfg, sets, {}, deps(fake));
  return { cfg, sets, fake, plan };
}

describe("applyApple", () => {
  it("uploads into new sets, waits for processing, orders, verifies, and never submits", async () => {
    const { cfg, sets, fake, plan } = await planned();
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report).toMatchObject({ ok: true, error: null, store: "apple", version: "1.1", digest: plan.digest, editId: null });
    expect(fake.checksums("loc-en", "APP_IPHONE_67")).toEqual(sets[0].files.map((f) => f.md5));
    expect(fake.checksums("loc-de", "APP_IPHONE_67")).toEqual(sets[1].files.map((f) => f.md5));
    expect(report.sets.map((s) => [s.storeLocale, s.status, s.uploaded.length, s.order.length])).toEqual([["en-US", "changed", 2, 2], ["de-DE", "changed", 2, 2]]);
    expect(fake.calls.filter((c) => c.startsWith("PUT "))).toHaveLength(8);
    expect(fake.calls.some((c) => /submission/i.test(c))).toBe(false);
  });

  it("deletes superseded and failed screenshots before uploading, and keeps finished matches", async () => {
    const { cfg, sets, fake, plan } = await planned((f, s) => {
      f.seed("loc-en", "APP_IPHONE_67", [{ checksum: "old" }, { checksum: s[0].files[1].md5 }, { checksum: s[0].files[0].md5, state: "FAILED" }]);
    });
    const kept = fake.setFor("loc-en", "APP_IPHONE_67")!.shots[1];
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report.ok).toBe(true);
    expect(fake.setFor("loc-en", "APP_IPHONE_67")!.shots[1]).toBe(kept);
    expect(fake.checksums("loc-en", "APP_IPHONE_67")).toEqual(sets[0].files.map((f) => f.md5));
    const writes = fake.writes();
    expect(writes.findLastIndex((c) => c.startsWith("DELETE "))).toBeLessThan(writes.indexOf("POST /v1/appScreenshots"));
  });

  it("makes room in a full set of ten", async () => {
    const { cfg, sets, fake, plan } = await planned((f) => {
      f.seed("loc-en", "APP_IPHONE_67", Array.from({ length: 10 }, (_, i) => ({ checksum: `old${i}` })));
    });
    expect((await applyApple(cfg, sets, {}, plan, deps(fake))).ok).toBe(true);
    expect(fake.checksums("loc-en", "APP_IPHONE_67")).toEqual(sets[0].files.map((f) => f.md5));
  });

  it("changes nothing in sets that already match", async () => {
    const { cfg, sets, fake, plan } = await planned();
    await applyApple(cfg, sets, {}, plan, deps(fake));
    const { plan: again } = await planApple(cfg, sets, {}, deps(fake));
    expect(again.sets.map((s) => s.status)).toEqual(["unchanged", "unchanged"]);
    fake.calls = [];
    const report = await applyApple(cfg, sets, {}, again, deps(fake));
    expect(report.sets.map((s) => s.status)).toEqual(["unchanged", "unchanged"]);
    expect(fake.writes()).toEqual([]);
  });

  it("refuses without a saved plan, or when the store changed since the plan, before changing anything", async () => {
    const { cfg, sets, fake, plan } = await planned();
    await expect(applyApple(cfg, sets, {}, null, deps(fake))).rejects.toThrow(/No saved plan/);
    fake.seed("loc-en", "APP_IPHONE_67", [{ checksum: "late" }]);
    await expect(applyApple(cfg, sets, {}, plan, deps(fake))).rejects.toThrow(/differs from the saved plan/);
    expect(fake.writes()).toEqual([]);
  });

  it("never sends a file outside apple.com", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.uploadHost = "https://uploads.example.com";
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report.ok).toBe(false);
    expect(report.error).toMatch(/en-US APP_IPHONE_67: .*refusing to send export\/en\/iphone-6\.9\/01-a\.jpg outside apple\.com/);
    expect(fake.calls.some((c) => c.startsWith("PUT "))).toBe(false);
  });

  it("reports a screenshot App Store Connect could not process", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.failProcessing = true;
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report).toMatchObject({ ok: false, error: expect.stringMatching(/could not process screenshot/) });
    expect(report.finishedAt).not.toBe("");
  });

  it("records what a failed set had already done, and does not start later sets", async () => {
    const { cfg, sets, fake, plan } = await planned((f) => {
      f.seed("loc-en", "APP_IPHONE_67", [{ checksum: "old" }]);
    });
    fake.processingPolls = 100_000;
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report.ok).toBe(false);
    expect(report.sets).toHaveLength(1);
    expect(report.sets[0]).toMatchObject({ storeLocale: "en-US", status: "failed" });
    expect(report.sets[0].deleted).toHaveLength(1);
    expect(report.sets[0].uploaded).toHaveLength(2);
  });

  it("gives up after five minutes of processing", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.processingPolls = 100_000;
    const report = await applyApple(cfg, sets, {}, plan, deps(fake));
    expect(report.error).toMatch(/still processing after 5 minutes/);
    expect(clock).toBeGreaterThanOrEqual(5 * 60_000);
  });
});
