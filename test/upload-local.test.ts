import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUILT_IN_TARGETS } from "../src/config/targets.js";
import { localSets, slotsFor } from "../src/upload/local.js";
import { type PlannedSet, describePlan, describeReport, makePlan, planPath, readPlan, samePlan, writeJson } from "../src/upload/plan.js";
import { tempDir } from "./helpers.js";
import { uploadWorkspace } from "./upload/workspace.js";

describe("slotsFor", () => {
  it("maps targets to store slots", () => {
    const t = (name: string) => ({ name, ...BUILT_IN_TARGETS[name] });
    expect(slotsFor(t("iphone-6.9"))).toEqual(["APP_IPHONE_67"]);
    expect(slotsFor(t("iphone-6.5"))).toEqual(["APP_IPHONE_65"]);
    expect(slotsFor(t("ipad-13"))).toEqual(["APP_IPAD_PRO_3GEN_129"]);
    expect(slotsFor(t("android-phone"))).toEqual(["phoneScreenshots"]);
    expect(slotsFor(t("android-tablet"))).toEqual(["sevenInchScreenshots", "tenInchScreenshots"]);
    expect(slotsFor({ name: "wide", w: 2868, h: 1320, platform: "iphone", store: "apple", formFactor: "tall" })).toEqual(["APP_IPHONE_67"]);
    expect(slotsFor({ name: "old", w: 1242, h: 2208, platform: "iphone", store: "apple", formFactor: "p916" })).toEqual([]);
  });
});

describe("localSets", () => {
  it("lists each locale and target's exports in page order with their checksums", async () => {
    const cfg = await uploadWorkspace();
    const { sets, problems } = await localSets(cfg, "play");
    expect(problems).toEqual([]);
    expect(sets.map((s) => [s.locale, s.storeLocale, s.target, s.slot])).toEqual([["en", "en-US", "android-phone", "phoneScreenshots"], ["de", "de-DE", "android-phone", "phoneScreenshots"]]);
    const f = sets[0].files[1];
    const bytes = fs.readFileSync(f.file);
    expect(f).toMatchObject({
      page: "02-b",
      rel: "export/en/android-phone/02-b.jpg",
      bytes: bytes.length,
      md5: crypto.createHash("md5").update(bytes).digest("hex"),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("limits to the chosen locales and rejects unknown ones", async () => {
    const cfg = await uploadWorkspace();
    expect((await localSets(cfg, "apple", { locales: ["de"] })).sets.map((s) => s.locale)).toEqual(["de"]);
    await expect(localSets(cfg, "apple", { locales: ["fr"] })).rejects.toThrow(/Unknown locale\(s\): fr/);
  });

  it("reports exports that fail the store checks, for that store only, and lists no sets", async () => {
    const cfg = await uploadWorkspace();
    fs.rmSync(path.join(cfg.root, "export/de/iphone-6.9/02-b.jpg"));
    const { sets, problems } = await localSets(cfg, "apple");
    expect(sets).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/store\.missing \(de\/iphone-6\.9\/02-b\).*run shotsmith build/)]);
    expect((await localSets(cfg, "play")).problems).toEqual([]);
  });

  it("reports targets that share a slot or have none, and locales that share a language", async () => {
    const cfg = await uploadWorkspace({
      targets: ["iphone-6.9", { name: "max", w: 1320, h: 2868, platform: "iphone" }, { name: "se", w: 1242, h: 2208, platform: "iphone" }],
      locales: [{ code: "en", apple: "en-US" }, { code: "us", apple: "en-US" }],
    });
    const { problems } = await localSets(cfg, "apple");
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/"iphone-6\.9" and "max" both fill APP_IPHONE_67/),
      expect.stringMatching(/"se" \(1242x2208\) has no App Store display type/),
      expect.stringMatching(/"en" and "us" both map to App Store language en-US/),
    ]));
  });

  it("needs targets for the store", async () => {
    const cfg = await uploadWorkspace({ targets: ["android-phone"] });
    await expect(localSets(cfg, "apple")).rejects.toThrow(/no App Store targets/);
  });
});

const set = (o: Partial<PlannedSet> = {}): PlannedSet => ({
  locale: "en", storeLocale: "en-US", target: "iphone-6.9", slot: "APP_IPHONE_67", status: "change",
  keep: [{ id: "1", file: "export/en/iphone-6.9/01-a.jpg" }],
  remove: [{ id: "2", checksum: "old", reason: "superseded" }],
  upload: [{ file: "export/en/iphone-6.9/02-b.jpg", checksum: "b" }],
  order: ["export/en/iphone-6.9/01-a.jpg", "export/en/iphone-6.9/02-b.jpg"],
  ...o,
});
const base = { store: "apple" as const, app: "com.example.demo", version: "1.1", problems: [] };

describe("plans", () => {
  it("digests what would change, not remote ids or the time", () => {
    const a = makePlan({ ...base, sets: [set()] }, new Date(0));
    const b = makePlan({ ...base, sets: [set({ keep: [{ id: "99", file: "export/en/iphone-6.9/01-a.jpg" }], remove: [{ id: "98", checksum: "old", reason: "superseded" }] })] }, new Date(1e12));
    expect(b.digest).toBe(a.digest);
    expect(makePlan({ ...base, sets: [set({ remove: [{ id: "2", checksum: "other", reason: "superseded" }] })] }).digest).not.toBe(a.digest);
    expect(makePlan({ ...base, version: "1.2", sets: [set()] }).digest).not.toBe(a.digest);
  });

  it("writes, reads and compares saved plans", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const plan = makePlan({ ...base, sets: [set()] });
    expect(readPlan(cfg, "apple")).toBeNull();
    expect(() => samePlan(cfg, null, plan)).toThrow(/No saved plan at export\/upload-plan-apple\.json/);
    expect(writeJson(cfg, planPath(cfg, "apple"), plan)).toBe(path.join(cfg.root, "export/upload-plan-apple.json"));
    const saved = readPlan(cfg, "apple");
    expect(saved).toEqual(plan);
    expect(() => samePlan(cfg, saved, plan)).not.toThrow();
    expect(() => samePlan(cfg, saved, makePlan({ ...base, sets: [] }))).toThrow(/differs from the saved plan.*Nothing was changed/);
    expect(readPlan(cfg, "play")).toBeNull();
  });

  it("does not write through a linked output folder", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const elsewhere = tempDir("elsewhere-");
    fs.symlinkSync(elsewhere, path.join(cfg.root, "export"));
    expect(() => writeJson(cfg, planPath(cfg, "apple"), {})).toThrow(/link/);
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  });

  it("describes a plan and a report", () => {
    const plan = makePlan({ ...base, sets: [set(), set({ storeLocale: "de-DE", status: "unchanged", remove: [], upload: [] })], problems: ["something"] });
    expect(describePlan(plan)).toEqual([
      "App Store Connect plan for com.example.demo, version 1.1",
      "en-US iphone-6.9 (APP_IPHONE_67): keep 1, delete 1 (1 superseded), upload 1",
      "  order: 01-a.jpg, 02-b.jpg",
      "de-DE iphone-6.9 (APP_IPHONE_67): unchanged",
      "problem: something",
    ]);
    const head = { locale: "en", storeLocale: "en-US", target: "iphone-6.9", slot: "APP_IPHONE_67" };
    expect(describeReport({
      store: "apple", app: "a", version: "1.1", digest: "d", editId: null, startedAt: "", finishedAt: "", ok: true, error: null,
      sets: [
        { ...head, status: "changed", deleted: ["2"], uploaded: [{ file: "f", id: "3" }], order: [{ file: "e", id: "1", checksum: "x" }, { file: "f", id: "3", checksum: "y" }] },
        { ...head, storeLocale: "de-DE", status: "unchanged", deleted: [], uploaded: [], order: [] },
        { ...head, storeLocale: "fr-FR", status: "failed", deleted: ["9"], uploaded: [{ file: "f", id: "3" }, { file: "g", id: "4" }], order: [] },
      ],
    })).toEqual(["en-US iphone-6.9 (APP_IPHONE_67): deleted 1, uploaded 1, 2 in order and verified", "de-DE iphone-6.9 (APP_IPHONE_67): unchanged", "fr-FR iphone-6.9 (APP_IPHONE_67): failed after deleting 1 and uploading 2"]);
  });
});
