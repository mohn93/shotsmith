import { describe, expect, it } from "vitest";
import { type LocalSet, localSets } from "../src/upload/local.js";
import { type PlayDeps, applyPlay, commitPlay, planPlay } from "../src/upload/play.js";
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
    const report = await applyPlay(cfg, sets, plan, deps(fake));
    expect(report).toMatchObject({ ok: true, error: null, store: "play", editId: "1002", digest: plan.digest });
    expect(report.sets.map((s) => [s.storeLocale, s.status])).toEqual([["en-US", "unchanged"], ["de-DE", "changed"]]);
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
    expect(report.sets[0]).toMatchObject({ storeLocale: "en-US", status: "failed", uploaded: [] });
    expect(fake.edits.size).toBe(0);
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
    await expect(commitPlay(cfg, "1001", deps(new FakePlay()))).rejects.toThrow(/no longer has edit 1001.*--apply again/s);
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
