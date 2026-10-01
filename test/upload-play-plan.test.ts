import { describe, expect, it } from "vitest";
import { localSets, type LocalSet } from "../src/upload/local.js";
import { type PlayDeps, planPlay, planPlaySet } from "../src/upload/play.js";
import { FakePlay } from "./upload/fake-play.js";
import { uploadWorkspace } from "./upload/workspace.js";

const deps = (fake: FakePlay): PlayDeps => ({ transport: fake.transport, token: async () => "play-token" });
const EDITS = "/androidpublisher/v3/applications/com.example.demo/edits";
const local = (shas: string[]): LocalSet => ({
  locale: "en", storeLocale: "en-US", target: "android-phone", slot: "phoneScreenshots",
  files: shas.map((sha256, i) => ({ page: `p${i}`, file: `/ws/p${i}.jpg`, rel: `export/en/android-phone/p${i}.jpg`, bytes: 1, md5: `m${i}`, sha256 })),
});

describe("planPlaySet", () => {
  it("leaves a slot with the same images in the same order unchanged", () => {
    const s = planPlaySet(local(["a", "b"]), [{ id: "1", sha256: "a" }, { id: "2", sha256: "b" }]);
    expect(s).toMatchObject({ status: "unchanged", remove: [], upload: [], keep: [{ id: "1", file: "export/en/android-phone/p0.jpg" }, { id: "2", file: "export/en/android-phone/p1.jpg" }] });
  });

  it("replaces the whole slot when content or order differs", () => {
    const s = planPlaySet(local(["a", "b"]), [{ id: "2", sha256: "b" }, { id: "1", sha256: "a" }]);
    expect(s).toMatchObject({ status: "change", keep: [], remove: [{ id: "2", checksum: "b", reason: "replaced", fileName: null }, { id: "1", checksum: "a", reason: "replaced", fileName: null }] });
    expect(s.upload.map((u) => u.checksum)).toEqual(["a", "b"]);
  });
});

describe("planPlay", () => {
  it("compares each listing slot by sha256 through a throwaway edit", async () => {
    const cfg = await uploadWorkspace();
    const { sets } = await localSets(cfg, "play");
    const fake = new FakePlay();
    fake.seed("en-US", "phoneScreenshots", sets[0].files.map((f) => f.sha256));
    const plan = await planPlay(cfg, sets, deps(fake));
    expect(plan).toMatchObject({ store: "play", app: "com.example.demo", version: null, problems: [] });
    expect(plan.sets.map((s) => [s.storeLocale, s.slot, s.status])).toEqual([["en-US", "phoneScreenshots", "unchanged"], ["de-DE", "phoneScreenshots", "change"]]);
    expect(fake.edits.size).toBe(0);
    expect(fake.writes()).toEqual([`POST ${EDITS}`, `DELETE ${EDITS}/1001`]);
  });

  it("plans both tablet slots from one set of images", async () => {
    const cfg = await uploadWorkspace({ targets: ["android-tablet"] });
    const plan = await planPlay(cfg, (await localSets(cfg, "play")).sets, deps(new FakePlay()));
    expect(plan.sets.map((s) => [s.storeLocale, s.slot])).toEqual([
      ["en-US", "sevenInchScreenshots"], ["en-US", "tenInchScreenshots"], ["de-DE", "sevenInchScreenshots"], ["de-DE", "tenInchScreenshots"],
    ]);
  });

  it("reports a language the listing does not have", async () => {
    const cfg = await uploadWorkspace();
    const plan = await planPlay(cfg, (await localSets(cfg, "play")).sets, deps(new FakePlay(["en-US"])));
    expect(plan.sets.map((s) => s.storeLocale)).toEqual(["en-US"]);
    expect(plan.problems).toEqual([expect.stringMatching(/no de-DE store listing for com\.example\.demo.*leave out locale de with -l/)]);
  });

  it("explains a 403 as a missing store listing permission", async () => {
    const cfg = await uploadWorkspace();
    const fake = new FakePlay();
    fake.forbidden = true;
    await expect(planPlay(cfg, (await localSets(cfg, "play")).sets, deps(fake))).rejects.toThrow(/\(403\).*lacks permission.*store listing/);
  });

  it("explains a 401 that means insufficient permissions like a 403, and any other 401 as a request Google did not accept", async () => {
    const cfg = await uploadWorkspace();
    const { sets } = await localSets(cfg, "play");
    const fake = new FakePlay();
    fake.insufficient401 = true;
    await expect(planPlay(cfg, sets, deps(fake))).rejects.toThrow(/\(401\): The current user has insufficient permissions to perform the requested operation\. The service account lacks permission.*store listing/);
    const bad = new FakePlay();
    await expect(planPlay(cfg, sets, { transport: bad.transport, token: async () => "wrong" })).rejects.toThrow(/\(401\): Request had invalid authentication credentials\. Google did not accept the request: check the service account key, and that the account has access to this app in Play Console/);
  });

  it("needs a package name", async () => {
    const cfg = await uploadWorkspace({ play: false });
    await expect(planPlay(cfg, (await localSets(cfg, "play")).sets, deps(new FakePlay()))).rejects.toThrow(/no "play": \{ "packageName" \}/);
  });
});
