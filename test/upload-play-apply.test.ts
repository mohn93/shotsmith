import { describe, expect, it } from "vitest";
import { type LocalSet, localSets } from "../src/upload/local.js";
import { type PlayDeps, PlayClient, applyPlay, commitPlay, planPlay } from "../src/upload/play.js";
import { FakePlay } from "./upload/fake-play.js";
import { type WorkspaceOptions, uploadWorkspace } from "./upload/workspace.js";

const deps = (fake: FakePlay): PlayDeps => ({ transport: fake.transport, token: async () => "play-token" });
const EDITS = "/androidpublisher/v3/applications/com.example.demo/edits";

async function planned(prep?: (fake: FakePlay, sets: LocalSet[]) => void, o: WorkspaceOptions = {}) {
  const cfg = await uploadWorkspace(o);
  const { sets } = await localSets(cfg, "play");
  const fake = new FakePlay();
  prep?.(fake, sets);
  const plan = await planPlay(cfg, sets, deps(fake));
  return { cfg, sets, fake, plan };
}

describe("applyPlay", () => {
  it("stages changed slots in a validated draft edit and leaves the live listing alone", async () => {
    const { cfg, sets, fake, plan } = await planned((f, s) => {
      f.seed("en-US", "phoneScreenshots", s[0].files.map((x) => x.sha256));
      f.seed("de-DE", "phoneScreenshots", ["old"]);
    });
    const oldId = fake.live.get("de-DE")!.get("phoneScreenshots")![0].id;
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: true, error: null, store: "play", editId: "1002", editExpiresAt: new Date(9999999999 * 1000).toISOString(), digest: plan.digest });
    expect(report.sets.map((s) => [s.storeLocale, s.status])).toEqual([["en-US", "unchanged"], ["de-DE", "changed"]]);
    const staged = fake.edits.get("1002")!.get("de-DE")!.get("phoneScreenshots")!;
    const de = report.sets[1];
    expect(de.deleted).toEqual([oldId]);
    expect(de.uploaded).toEqual(sets[1].files.map((f, i) => ({ file: f.rel, id: staged[i].id })));
    expect(de.order).toEqual(sets[1].files.map((f, i) => ({ file: f.rel, id: staged[i].id, checksum: f.sha256 })));
    expect(fake.shas("de-DE", "phoneScreenshots", fake.edits.get("1002"))).toEqual(sets[1].files.map((f) => f.sha256));
    expect(fake.shas("de-DE", "phoneScreenshots")).toEqual(["old"]);
    expect(fake.calls).toContain(`POST ${EDITS}/1002:validate`);
    expect(fake.writes().some((c) => c.includes("/listings/en-US/"))).toBe(false);
  });

  it("fills both tablet slots", async () => {
    const { cfg, sets, fake, plan } = await planned(undefined, { targets: ["android-tablet"] });
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    const edit = fake.edits.get(report.editId!)!;
    for (const slot of ["sevenInchScreenshots", "tenInchScreenshots"]) expect(fake.shas("en-US", slot, edit)).toEqual(sets[0].files.map((f) => f.sha256));
  });

  it("keeps no edit when nothing changes", async () => {
    const { cfg, sets, fake, plan } = await planned((f, s) => {
      for (const [i, lang] of ["en-US", "de-DE"].entries()) f.seed(lang, "phoneScreenshots", s[i].files.map((x) => x.sha256));
    });
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: true, editId: null });
    expect(fake.edits.size).toBe(0);
  });

  it("refuses without a saved plan, or when the listing changed since the plan, and deletes its edit", async () => {
    const { cfg, sets, fake, plan } = await planned();
    await expect(applyPlay(cfg, sets, null, deps(fake))).rejects.toThrow(/No saved plan/);
    fake.seed("en-US", "phoneScreenshots", ["late"]);
    await expect(applyPlay(cfg, sets, plan, deps(fake))).rejects.toThrow(/differs from the saved plan/);
    expect(fake.edits.size).toBe(0);
    expect(fake.writes().filter((c) => c.includes("/listings/"))).toEqual([]);
  });

  it("deletes its edit when Google stores different bytes", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.corruptUploads = true;
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: false, editId: null, error: expect.stringMatching(/en-US phoneScreenshots: Google Play stored .* with a different checksum/) });
    expect(report.sets).toHaveLength(1);
    expect(report.sets[0]).toMatchObject({ storeLocale: "en-US", status: "discarded", uploaded: [] });
    expect(report.error).toMatch(/draft edit was discarded/);
    expect(report.error).not.toContain("..");
    expect(fake.edits.size).toBe(0);
  });

  it("says so when the draft edit cannot be deleted after a failure", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.corruptUploads = true;
    fake.failDeleteEdit = true;
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report.ok).toBe(false);
    expect(report.error).toMatch(/with a different checksum\. The draft edit 1002 could not be deleted; it holds unvalidated changes and will expire on its own\. Nothing was committed, so the Google Play listing is unchanged$/);
    expect(report.error).not.toMatch(/was discarded|\.\./);
    expect(report).toMatchObject({ editId: null, editExpiresAt: null });
    expect(fake.edits.has("1002")).toBe(true);
    expect(fake.live.get("en-US")!.get("phoneScreenshots") ?? []).toEqual([]);
  });

  it("fails when the edit's listing differs from the export after the upload", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.dropLastImage = true;
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: false, editId: null, error: expect.stringMatching(/en-US phoneScreenshots: .*differs from the export.*draft edit was discarded/) });
    expect(report.sets[0].status).toBe("discarded");
    expect(fake.edits.size).toBe(0);
  });

  it("uploads with uploadType=media", async () => {
    const fake = new FakePlay();
    const c = new PlayClient(deps(fake), "com.example.demo");
    const { id } = await c.openEdit();
    await expect(c.upload(id, "en-US", "phoneScreenshots", new Uint8Array(1))).resolves.toMatchObject({ sha256: expect.any(String) });
    const bare = await fake.transport({ method: "POST", url: `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.example.demo/edits/${id}/listings/en-US/phoneScreenshots`, headers: { Authorization: "Bearer play-token" }, body: new Uint8Array(1) });
    expect(bare.status).toBe(400);
  });

  it("discards every staged set when the edit does not validate", async () => {
    const { cfg, sets, fake, plan } = await planned();
    fake.failValidate = true;
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: false, editId: null, error: expect.stringMatching(/Validation failed.*draft edit was discarded.*listing is unchanged/s) });
    expect(report.sets.map((s) => s.status)).toEqual(["discarded", "discarded"]);
    expect(fake.edits.size).toBe(0);
    expect(fake.shas("en-US", "phoneScreenshots")).toEqual([]);
  });
});

describe("commitPlay", () => {
  it("commits a staged edit and notes managed publishing", async () => {
    const { cfg, sets, fake, plan } = await planned();
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    const res = await commitPlay(cfg, report.editId!, deps(fake));
    expect(res.editId).toBe(report.editId);
    expect(res.lines.join("\n")).toMatch(/Committed edit 1002\..*Publishing overview/s);
    expect(fake.shas("de-DE", "phoneScreenshots")).toEqual(sets[1].files.map((f) => f.sha256));
  });

  it("explains an edit Google discarded", async () => {
    const cfg = await uploadWorkspace({ export: false });
    await expect(commitPlay(cfg, "1001", deps(new FakePlay()))).rejects.toThrow(/no longer has edit 1001.*expires, or it was already committed \(check Play Console\)\..*--apply again/s);
  });

  it("explains a 403 on commit", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const fake = new FakePlay();
    fake.forbidden = true;
    await expect(commitPlay(cfg, "1001", deps(fake))).rejects.toThrow(/lacks permission.*store listing/);
  });

  it("refuses an edit id that is not one, without calling Google", async () => {
    const cfg = await uploadWorkspace({ export: false });
    const fake = new FakePlay();
    await expect(commitPlay(cfg, "1001/../x", deps(fake))).rejects.toThrow(/not a Play edit id/);
    expect(fake.calls).toEqual([]);
  });
});
