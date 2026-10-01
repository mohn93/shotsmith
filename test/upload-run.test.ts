import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { AppleDeps } from "../src/upload/apple.js";
import { type UploadPlan, type UploadReport, readPlan, reportPath } from "../src/upload/plan.js";
import type { PlayDeps } from "../src/upload/play.js";
import { runApple, runPlay } from "../src/upload/run.js";
import { FakeAsc } from "./upload/fake-asc.js";
import { FakePlay } from "./upload/fake-play.js";
import { uploadWorkspace } from "./upload/workspace.js";

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
    expect((JSON.parse(fs.readFileSync(reportPath(cfg, "apple"), "utf8")) as UploadReport).ok).toBe(false);
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
    expect(staged.lines.at(-1)).toBe("Staged and validated in draft edit 1002; nothing is live yet. After the user confirms, run: shotsmith upload play --commit 1002");
    const committed = await runPlay(cfg, { commit: "1002" }, play(fake));
    expect(committed).toMatchObject({ ok: true, exitCode: 0, json: { committed: "1002" } });
  });

  it("says so when there is nothing to change", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    await runPlay(cfg, {}, play(fake));
    await runPlay(cfg, { apply: true }, play(fake));
    await runPlay(cfg, { commit: "1002" }, play(fake));
    await runPlay(cfg, {}, play(fake));
    expect((await runPlay(cfg, { apply: true }, play(fake))).lines.at(-1)).toBe("Nothing to change; no edit was kept.");
  });

  it("rejects --apply with --commit, and a bad edit id, before connecting", async () => {
    const cfg = await uploadWorkspace();
    await expect(runPlay(cfg, { apply: true, commit: "1" }, never)).rejects.toThrow(/either --apply or --commit/);
    await expect(runPlay(cfg, { commit: "a b" }, never)).rejects.toThrow(/not a Play edit id/);
  });
});
