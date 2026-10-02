import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppleDeps } from "../src/upload/apple.js";
import { type UploadPlan, type UploadReport, planPath, readPlan, reportPath } from "../src/upload/plan.js";
import type { PlayDeps } from "../src/upload/play.js";
import { localSets } from "../src/upload/local.js";
import { runApple, runPlay } from "../src/upload/run.js";
import { FakeAsc } from "./upload/fake-asc.js";
import { FakePlay } from "./upload/fake-play.js";
import { paint, uploadWorkspace } from "./upload/workspace.js";

let clock = 0;
const apple = (fake: FakeAsc) => (): AppleDeps => ({ transport: fake.transport, token: () => "token", now: () => clock, sleep: async (ms) => { clock += ms; } });
const play = (fake: FakePlay) => (): PlayDeps => ({ transport: fake.transport, token: async () => "play-token" });
const never = () => { throw new Error("must not connect"); };

describe("runApple", () => {
  it("plans, writes the plan and changes nothing", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    const out = await runApple(cfg, {}, apple(fake));
    expect(out).toMatchObject({ ok: true, exitCode: 0, json: { planFile: "export/upload-plan-apple.json" } });
    expect(readPlan(cfg, "apple")?.digest).toBe((out.json.plan as UploadPlan).digest);
    expect(out.lines[0]).toBe("App Store Connect plan for com.example.demo, version 1.1");
    expect(out.lines.at(-1)).toMatch(/Nothing was changed\..*--apply only after they confirm/);
    expect(fake.writes()).toEqual([]);
  });

  it("applies the saved plan and writes the report", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    const out = await runApple(cfg, { apply: true }, apple(fake));
    expect(out).toMatchObject({ ok: true, exitCode: 0, json: { reportFile: "export/upload-report-apple.json" } });
    expect(out.lines).toContain("Nothing was submitted for review.");
    expect(JSON.parse(fs.readFileSync(reportPath(cfg, "apple"), "utf8")).ok).toBe(true);
  });

  it("writes the report and fails when applying fails", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    fake.failProcessing = true;
    const out = await runApple(cfg, { apply: true }, apple(fake));
    expect(out).toMatchObject({ ok: false, exitCode: 2, json: { error: { message: expect.stringMatching(/could not process.*report: export\/upload-report-apple\.json/s) }, reportFile: "export/upload-report-apple.json" } });
    expect(out.lines).toEqual(expect.arrayContaining([expect.stringMatching(/failed after deleting/), expect.stringMatching(/^Upload failed: .*could not process/), "Report written to export/upload-report-apple.json."]));
    const partly = out.lines.findIndex((l) => l.startsWith("App Store Connect was partly changed: the screenshots listed above were deleted or uploaded and stay in the version, which may now be incomplete. Sets not listed were not touched. Run shotsmith upload apple again with the same options, show the user the new plan, and apply after they confirm. Do not submit the version until then."));
    expect(partly).toBeGreaterThan(out.lines.findIndex((l) => /failed after deleting/.test(l)));
    expect(partly).toBe(out.lines.findIndex((l) => l.startsWith("Upload failed:")) - 1);
    expect((JSON.parse(fs.readFileSync(reportPath(cfg, "apple"), "utf8")) as UploadReport).ok).toBe(false);
  });

  it("says nothing was changed when applying fails before anything was deleted or uploaded", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    const refuse = (): AppleDeps => ({ ...apple(fake)(), transport: async (req) => (req.method === "POST" && req.url.endsWith("/v1/appScreenshotSets") ? { status: 500, text: "{}" } : fake.transport(req)) });
    const out = await runApple(cfg, { apply: true }, refuse);
    expect(out).toMatchObject({ ok: false, exitCode: 2 });
    expect(out.lines.some((l) => /partly changed/.test(l))).toBe(false);
    expect(out.lines.findIndex((l) => l === "Nothing was changed in App Store Connect.")).toBe(out.lines.findIndex((l) => l.startsWith("Upload failed:")) - 1);
  });

  it("does not say nothing was changed when a new set and an unfinished reservation were left behind", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    fake.uploadHost = "https://uploads.example.com";
    fake.failDelete = true;
    const out = await runApple(cfg, { apply: true }, apple(fake));
    expect(out).toMatchObject({ ok: false, exitCode: 2 });
    const text = out.lines.join("\n");
    expect(text).not.toContain("Nothing was changed");
    expect(out.lines.some((l) => l.startsWith("App Store Connect was partly changed"))).toBe(true);
    expect((out.json.report as UploadReport).sets[0]).toMatchObject({ changedStore: true, deleted: [], uploaded: [] });
  });

  it("says the store was partly changed when the read-back after a reorder fails", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    const exported = (await localSets(cfg, "apple")).sets[0].files;
    fake.seed("loc-en", "APP_IPHONE_67", [{ checksum: exported[1].md5 }, { checksum: exported[0].md5 }]);
    await runApple(cfg, {}, apple(fake));
    fake.ignoreReorder = true;
    const out = await runApple(cfg, { apply: true }, apple(fake));
    expect(out).toMatchObject({ ok: false, exitCode: 2 });
    expect(out.lines.join("\n")).not.toContain("Nothing was changed");
    const partly = out.lines.find((l) => l.startsWith("App Store Connect was partly changed"));
    expect(partly).toMatch(/^App Store Connect was partly changed: a screenshot set was created or reordered before the failure, /);
    expect(partly).not.toMatch(/deleted or uploaded/);
    expect(partly).toMatch(/Run shotsmith upload apple again with the same options.*Do not submit the version until then\.$/);
    expect((out.json.report as UploadReport).sets[0]).toMatchObject({ status: "failed", changedStore: true, deleted: [], uploaded: [] });
  });

  it("keeps the saved plan when --apply finds export problems", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    const before = fs.readFileSync(planPath(cfg, "apple"), "utf8");
    fs.rmSync(path.join(cfg.root, "export/de/iphone-6.9/02-b.jpg"));
    const out = await runApple(cfg, { apply: true }, never);
    expect(out).toMatchObject({ ok: false, exitCode: 1 });
    expect((out.json.plan as UploadPlan).problems[0]).toMatch(/store\.missing/);
    expect(out.json.planFile).toBeUndefined();
    expect(out.lines.join("\n")).not.toMatch(/Plan written/);
    expect(fs.readFileSync(planPath(cfg, "apple"), "utf8")).toBe(before);
    const pcfg = await uploadWorkspace();
    await runPlay(pcfg, {}, play(new FakePlay()));
    const playBefore = fs.readFileSync(planPath(pcfg, "play"), "utf8");
    fs.rmSync(path.join(pcfg.root, "export/de/android-phone/02-b.jpg"));
    expect(await runPlay(pcfg, { apply: true }, never)).toMatchObject({ ok: false, exitCode: 1 });
    expect(fs.readFileSync(planPath(pcfg, "play"), "utf8")).toBe(playBefore);
  });

  it("looks for the saved plan before connecting", async () => {
    const cfg = await uploadWorkspace();
    await expect(runApple(cfg, { apply: true }, never)).rejects.toThrow(/No saved plan at export\/upload-plan-apple\.json\. Run shotsmith upload apple without --apply/);
    await expect(runPlay(cfg, { apply: true }, never)).rejects.toThrow(/No saved plan at export\/upload-plan-play\.json/);
  });

  it("replaces the earlier report with a placeholder when --apply starts, so a refused apply leaves no stale report", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    const placeholder = (store: "apple" | "play", app: string) => {
      const r = JSON.parse(fs.readFileSync(reportPath(cfg, store), "utf8")) as UploadReport;
      expect(r).toMatchObject({ store, app, version: null, digest: "", editId: null, editExpiresAt: null, ok: false, error: "apply did not finish", sets: [] });
      expect(r.startedAt).toBe(r.finishedAt);
      expect(Number.isNaN(Date.parse(r.startedAt))).toBe(false);
    };
    await runApple(cfg, {}, apple(fake));
    await runApple(cfg, { apply: true }, apple(fake));
    expect(JSON.parse(fs.readFileSync(reportPath(cfg, "apple"), "utf8")).ok).toBe(true);
    await paint(cfg, "en", "iphone-6.9", "01-a", 1);
    await expect(runApple(cfg, { apply: true }, apple(fake))).rejects.toThrow(/differs from the saved plan/);
    placeholder("apple", "com.example.demo");
    const p = new FakePlay();
    await runPlay(cfg, {}, play(p));
    await runPlay(cfg, { apply: true }, play(p));
    expect(JSON.parse(fs.readFileSync(reportPath(cfg, "play"), "utf8")).editId).toBe("1002");
    await paint(cfg, "en", "android-phone", "01-a", 1);
    await expect(runPlay(cfg, { apply: true }, play(p))).rejects.toThrow(/differs from the saved plan/);
    placeholder("play", "com.example.demo");
    // The staged edit's id is gone from the report, so it cannot be committed from it.
    await expect(runPlay(cfg, { commit: "1002" }, never)).rejects.toThrow(/staged no edit.*delete export\/upload-report-play\.json first/);
  });

  it("says the store already matches when every set is unchanged", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakeAsc();
    await runApple(cfg, {}, apple(fake));
    await runApple(cfg, { apply: true }, apple(fake));
    const again = await runApple(cfg, {}, apple(fake));
    expect(again).toMatchObject({ ok: true, exitCode: 0 });
    expect(again.lines.at(-1)).toBe("Plan written to export/upload-plan-apple.json. The store already matches the exports; nothing to upload.");
  });

  it("reports export problems without credentials or a connection", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const out = await runApple(cfg, {}, never);
    expect(out).toMatchObject({ ok: false, exitCode: 1 });
    expect((out.json.plan as UploadPlan).problems[0]).toMatch(/store\.missing/);
    expect(out.lines.at(-1)).toMatch(/Fix the problems above/);
    await expect(runApple(cfg, { apply: true }, never)).resolves.toMatchObject({ exitCode: 1 });
  });

  it("needs a bundle id", async () => {
    const cfg = await uploadWorkspace({ apple: false });
    await expect(runApple(cfg, {}, never)).rejects.toThrow(/no "apple": \{ "bundleId" \}/);
  });
});

describe("runPlay", () => {
  it("plans, stages after the plan, and prints the commit command", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    const planned = await runPlay(cfg, {}, play(fake));
    expect(planned.lines.at(-1)).toMatch(/--apply to stage.*nothing goes live until --commit/);
    const staged = await runPlay(cfg, { apply: true }, play(fake));
    expect(staged.lines.at(-1)).toBe(`Staged and validated in draft edit 1002 (expires ${new Date(9999999999 * 1000).toISOString()}); nothing is live yet. After the user confirms, run: shotsmith upload play --commit 1002`);
    const committed = await runPlay(cfg, { commit: "1002" }, play(fake));
    expect(committed).toMatchObject({ ok: true, exitCode: 0, json: { committed: "1002" } });
  });

  it("says so when there is nothing to change", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    await runPlay(cfg, { commit: "1002" }, play(fake));
    const again = await runPlay(cfg, {}, play(fake));
    expect(again.lines.at(-1)).toBe("Plan written to export/upload-plan-play.json. The store already matches the exports; nothing to upload.");
    expect((await runPlay(cfg, { apply: true }, play(fake))).lines.at(-1)).toBe("Nothing to change; no edit was kept.");
  });

  it("commits only the edit the last apply staged, and refuses another before connecting", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    expect(JSON.parse(fs.readFileSync(reportPath(cfg, "play"), "utf8")).editId).toBe("1002");
    await expect(runPlay(cfg, { commit: "1001" }, never)).rejects.toThrow(/last --apply staged edit 1002, not 1001/);
    await expect(runPlay(cfg, { commit: "1002" }, play(fake))).resolves.toMatchObject({ ok: true, json: { committed: "1002" } });
  });

  it("refuses --commit before connecting when the last apply staged nothing or left a bad report", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    await runPlay(cfg, { commit: "1002" }, play(fake));
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    expect(JSON.parse(fs.readFileSync(reportPath(cfg, "play"), "utf8")).editId).toBeNull();
    await expect(runPlay(cfg, { commit: "1002" }, never)).rejects.toThrow(/staged no edit.*delete export\/upload-report-play\.json first/);
    fs.writeFileSync(reportPath(cfg, "play"), "garbage");
    await expect(runPlay(cfg, { commit: "1002" }, never)).rejects.toThrow(/is not a Shotsmith upload report; delete it before committing edit 1002/);
  });

  it("passes --changes-not-sent-for-review to the commit, and only with --commit", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const fake = new FakePlay();
    fake.needsManualReview = true;
    fake.edits.set("1002", new Map([["en-US", new Map()]]));
    await expect(runPlay(cfg, { commit: "1002" }, play(fake))).rejects.toThrow(/will not send these changes for review automatically.*--commit 1002 --changes-not-sent-for-review/);
    await expect(runPlay(cfg, { commit: "1002", notSentForReview: true }, play(fake))).resolves.toMatchObject({ ok: true, json: { committed: "1002" } });
    await expect(runPlay(cfg, { notSentForReview: true }, never)).rejects.toThrow(/--changes-not-sent-for-review only applies to --commit/);
    await expect(runPlay(cfg, { apply: true, notSentForReview: true }, never)).rejects.toThrow(/--changes-not-sent-for-review only applies to --commit/);
  });

  it("reads the report once when committing", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    const read = vi.spyOn(fs, "readFileSync");
    try {
      await runPlay(cfg, { commit: "1002" }, play(fake));
      expect(read.mock.calls.filter(([file]) => file === reportPath(cfg, "play"))).toHaveLength(1);
    } finally {
      read.mockRestore();
    }
  });

  it("rejects --apply with --commit, and a bad edit id, before connecting", async () => {
    const cfg = await uploadWorkspace();
    await expect(runPlay(cfg, { apply: true, commit: "1" }, never)).rejects.toThrow(/either --apply or --commit/);
    await expect(runPlay(cfg, { commit: "a b" }, never)).rejects.toThrow(/not a Play edit id/);
    await expect(runPlay(cfg, { commit: "1", locales: ["en"] }, never)).rejects.toThrow(/-l does not apply to --commit/);
  });
});
