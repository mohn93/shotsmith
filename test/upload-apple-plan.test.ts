import { describe, expect, it } from "vitest";
import { type AppleDeps, type RemoteShot, planApple, planAppleSet } from "../src/upload/apple.js";
import { type LocalSet, localSets } from "../src/upload/local.js";
import { FakeAsc } from "./upload/fake-asc.js";
import { uploadWorkspace } from "./upload/workspace.js";

const deps = (fake: FakeAsc): AppleDeps => ({ transport: fake.transport, token: () => "token" });
const local = (md5s: string[]): LocalSet => ({
  locale: "en", storeLocale: "en-US", target: "iphone-6.9", slot: "APP_IPHONE_67",
  files: md5s.map((md5, i) => ({ page: `p${i}`, file: `/ws/export/en/iphone-6.9/p${i}.jpg`, rel: `export/en/iphone-6.9/p${i}.jpg`, bytes: 1, md5, sha256: `s${i}` })),
});
const remote = (id: string, checksum: string | null, state = "COMPLETE"): RemoteShot => ({ id, fileName: `${id}.jpg`, checksum, state });

describe("planAppleSet", () => {
  it("uploads everything into an empty set", () => {
    const s = planAppleSet(local(["a", "b"]), []);
    expect(s).toMatchObject({ status: "change", keep: [], remove: [], order: ["export/en/iphone-6.9/p0.jpg", "export/en/iphone-6.9/p1.jpg"] });
    expect(s.upload.map((u) => u.checksum)).toEqual(["a", "b"]);
  });

  it("leaves a matching set in the same order unchanged", () => {
    const s = planAppleSet(local(["a", "b"]), [remote("1", "a"), remote("2", "b")]);
    expect(s.status).toBe("unchanged");
    expect(s.keep).toEqual([{ id: "1", file: "export/en/iphone-6.9/p0.jpg" }, { id: "2", file: "export/en/iphone-6.9/p1.jpg" }]);
  });

  it("reorders a matching set without uploading or deleting", () => {
    const s = planAppleSet(local(["a", "b"]), [remote("2", "b"), remote("1", "a")]);
    expect(s).toMatchObject({ status: "change", upload: [], remove: [] });
    expect(s.keep.map((k) => k.id)).toEqual(["1", "2"]);
  });

  it("names why each remote screenshot goes", () => {
    const s = planAppleSet(local(["a", "b", "c"]), [remote("1", "a"), remote("2", "a"), remote("3", "old"), remote("4", "b", "FAILED"), remote("5", "c", "UPLOAD_COMPLETE")]);
    expect(s.keep.map((k) => k.id)).toEqual(["1"]);
    expect(s.remove).toEqual([
      { id: "2", checksum: "a", reason: "duplicate" },
      { id: "3", checksum: "old", reason: "superseded" },
      { id: "4", checksum: "b", reason: "failed" },
      { id: "5", checksum: "c", reason: "processing" },
    ]);
    expect(s.upload.map((u) => u.checksum)).toEqual(["b", "c"]);
  });

  it("needs one remote screenshot per page when two pages are identical", () => {
    const s = planAppleSet(local(["a", "a"]), [remote("1", "a")]);
    expect(s.keep.map((k) => k.id)).toEqual(["1"]);
    expect(s.upload).toHaveLength(1);
  });
});

describe("planApple", () => {
  async function setup() {
    const cfg = await uploadWorkspace();
    const { sets } = await localSets(cfg, "apple");
    return { cfg, sets, fake: new FakeAsc() };
  }

  it("plans every locale against the one editable version with read-only calls", async () => {
    const { cfg, sets, fake } = await setup();
    fake.seed("loc-en", "APP_IPHONE_67", [{ checksum: sets[0].files[0].md5 }, { checksum: "old" }]);
    const { plan } = await planApple(cfg, sets, {}, deps(fake));
    expect(plan).toMatchObject({ store: "apple", app: "com.example.demo", version: "1.1", problems: [] });
    expect(plan.sets.map((s) => [s.storeLocale, s.slot, s.status, s.keep.length, s.remove.length, s.upload.length])).toEqual([
      ["en-US", "APP_IPHONE_67", "change", 1, 1, 1],
      ["de-DE", "APP_IPHONE_67", "change", 0, 0, 2],
    ]);
    expect(fake.writes()).toEqual([]);
  });

  it("stops when no version is editable", async () => {
    const { cfg, sets, fake } = await setup();
    fake.versions[0].state = "READY_FOR_DISTRIBUTION";
    await expect(planApple(cfg, sets, {}, deps(fake))).rejects.toThrow(/No editable App Store version.*1\.1 \(READY_FOR_DISTRIBUTION\).*new version/s);
  });

  it("asks for --app-version when several versions are editable, and uses it", async () => {
    const { cfg, sets, fake } = await setup();
    fake.versions.push({ id: "ver2", appId: "app1", versionString: "1.2", state: "DEVELOPER_REJECTED" });
    fake.localizations.push({ id: "loc2-en", versionId: "ver2", locale: "en-US" }, { id: "loc2-de", versionId: "ver2", locale: "de-DE" });
    await expect(planApple(cfg, sets, {}, deps(fake))).rejects.toThrow(/Several editable versions: 1\.1 \(PREPARE_FOR_SUBMISSION\), 1\.2 \(DEVELOPER_REJECTED\)\. Pick one with --app-version/);
    expect((await planApple(cfg, sets, { version: "1.2" }, deps(fake))).plan.version).toBe("1.2");
  });

  it("refuses a named version that cannot change or does not exist", async () => {
    const { cfg, sets, fake } = await setup();
    fake.versions.push({ id: "ver0", appId: "app1", versionString: "1.0", state: "READY_FOR_DISTRIBUTION" });
    await expect(planApple(cfg, sets, { version: "1.0" }, deps(fake))).rejects.toThrow(/Version 1\.0 is READY_FOR_DISTRIBUTION/);
    await expect(planApple(cfg, sets, { version: "9.9" }, deps(fake))).rejects.toThrow(/Version 9\.9 not found/);
  });

  it("reports a locale the version does not have", async () => {
    const { cfg, sets, fake } = await setup();
    fake.localizations = fake.localizations.filter((l) => l.locale !== "de-DE");
    const { plan } = await planApple(cfg, sets, {}, deps(fake));
    expect(plan.sets.map((s) => s.storeLocale)).toEqual(["en-US"]);
    expect(plan.problems).toEqual([expect.stringMatching(/has no de-DE localization.*leave out locale de with -l/)]);
  });

  it("follows paged lists", async () => {
    const { cfg, sets, fake } = await setup();
    fake.pageSize = 1;
    fake.versions.unshift({ id: "ver0", appId: "app1", versionString: "1.0", state: "READY_FOR_DISTRIBUTION" });
    const { plan } = await planApple(cfg, sets, {}, deps(fake));
    expect(plan.version).toBe("1.1");
    expect(plan.sets).toHaveLength(2);
  });

  it("explains a rejected key and an unknown app", async () => {
    const { cfg, sets, fake } = await setup();
    fake.status401 = true;
    await expect(planApple(cfg, sets, {}, deps(fake))).rejects.toThrow(/did not accept the API key/);
    fake.status401 = false;
    fake.apps = [];
    await expect(planApple(cfg, sets, {}, deps(fake))).rejects.toThrow(/No app with bundle id com\.example\.demo/);
  });
});
