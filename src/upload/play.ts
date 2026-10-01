import crypto from "node:crypto";
import fs from "node:fs";
import type { ResolvedConfig } from "../config/schema.js";
import { type Method, StoreError, type Transport, parseJson } from "./http.js";
import type { LocalSet } from "./local.js";
import { type AppliedSet, type PlannedSet, type UploadPlan, type UploadReport, makePlan, samePlan } from "./plan.js";

export const PLAY_API = "https://androidpublisher.googleapis.com";
export interface PlayDeps { transport: Transport; token: () => Promise<string>; log?: (line: string) => void; now?: () => number }
type Json = Record<string, any>;
export interface PlayImage { id: string; sha256: string | null }
export interface PlayPair { plan: PlannedSet; local: LocalSet }

export class PlayClient {
  private readonly api: string;
  private readonly uploadApi: string;

  constructor(private readonly d: PlayDeps, readonly pkg: string) {
    this.api = `${PLAY_API}/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/edits`;
    this.uploadApi = `${PLAY_API}/upload/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/edits`;
  }

  private async request(method: Method, url: string, body?: string | Uint8Array, type = "application/json"): Promise<Json> {
    const r = await this.d.transport({ method, url, headers: { Authorization: `Bearer ${await this.d.token()}`, ...(body !== undefined ? { "Content-Type": type } : {}) }, body });
    const data = parseJson(r.text, "Google Play");
    if (r.status >= 400) throw new StoreError(playMessage(method, url, r.status, data), r.status);
    return data;
  }

  private slot = (edit: string, lang: string, slot: string) => `${this.api}/${edit}/listings/${encodeURIComponent(lang)}/${slot}`;

  async openEdit(): Promise<string> { return String((await this.request("POST", this.api, "{}")).id); }
  async deleteEdit(edit: string): Promise<void> { await this.request("DELETE", `${this.api}/${edit}`); }
  async languages(edit: string): Promise<string[]> { return ((await this.request("GET", `${this.api}/${edit}/listings`)).listings ?? []).map((l: Json) => String(l.language)); }
  async images(edit: string, lang: string, slot: string): Promise<PlayImage[]> {
    return ((await this.request("GET", this.slot(edit, lang, slot))).images ?? []).map((i: Json) => ({ id: String(i.id), sha256: i.sha256 ?? null }));
  }
  async clear(edit: string, lang: string, slot: string): Promise<void> { await this.request("DELETE", this.slot(edit, lang, slot)); }
  async upload(edit: string, lang: string, slot: string, bytes: Uint8Array): Promise<PlayImage> {
    const d = await this.request("POST", `${this.uploadApi}/${edit}/listings/${encodeURIComponent(lang)}/${slot}?uploadType=media`, bytes, "image/jpeg");
    return { id: String(d.image?.id), sha256: d.image?.sha256 ?? null };
  }
  async validate(edit: string): Promise<void> { await this.request("POST", `${this.api}/${edit}:validate`); }
  async commit(edit: string): Promise<void> { await this.request("POST", `${this.api}/${edit}:commit`); }
}

function playMessage(method: string, url: string, status: number, data: Json): string {
  const detail = data.error?.message;
  const what = `${method} ${url.replace(/^.*\/applications\//, "applications/").split("?")[0]} failed (${status})${detail ? `: ${detail}` : ""}`;
  if (status === 403) return `${what}. The service account lacks permission for this app: in Play Console, Users and permissions, give it access to the app with permission to edit the store listing`;
  if (status === 401) return `${what}. Google did not accept the access token; check the service account key`;
  return what;
}

export function playPackage(cfg: ResolvedConfig): string {
  if (!cfg.play) throw new Error(`shotsmith.config.json has no "play": { "packageName" }; add the app's package name to upload to Google Play`);
  return cfg.play.packageName;
}

// A slot is unchanged only when it holds the same images in the same order; otherwise the whole slot is replaced.
export function planPlaySet(local: LocalSet, remote: PlayImage[]): PlannedSet {
  const same = remote.length === local.files.length && remote.every((r, i) => r.sha256 === local.files[i].sha256);
  return {
    locale: local.locale, storeLocale: local.storeLocale, target: local.target, slot: local.slot,
    status: same ? "unchanged" : "change",
    keep: same ? remote.map((r, i) => ({ id: r.id, file: local.files[i].rel })) : [],
    remove: same ? [] : remote.map((r) => ({ id: r.id, checksum: r.sha256, reason: "replaced" as const })),
    upload: same ? [] : local.files.map((f) => ({ file: f.rel, checksum: f.sha256 })),
    order: local.files.map((f) => f.rel),
  };
}

export async function readPlay(c: PlayClient, edit: string, local: LocalSet[]): Promise<{ pairs: PlayPair[]; problems: string[] }> {
  const languages = new Set(await c.languages(edit));
  const problems = new Set<string>();
  const pairs: PlayPair[] = [];
  for (const l of local) {
    if (!languages.has(l.storeLocale)) {
      problems.add(`Google Play has no ${l.storeLocale} store listing for ${c.pkg}; add the language in Play Console first, or leave out locale ${l.locale} with -l`);
      continue;
    }
    pairs.push({ plan: planPlaySet(l, await c.images(edit, l.storeLocale, l.slot)), local: l });
  }
  return { pairs, problems: [...problems] };
}

// Reads through a throwaway edit, which is deleted again, so nothing changes.
export async function planPlay(cfg: ResolvedConfig, local: LocalSet[], deps: PlayDeps): Promise<UploadPlan> {
  const pkg = playPackage(cfg);
  const c = new PlayClient(deps, pkg);
  const edit = await c.openEdit();
  try {
    const { pairs, problems } = await readPlay(c, edit, local);
    return makePlan({ store: "play", app: pkg, version: null, sets: pairs.map((p) => p.plan), problems }, new Date(deps.now?.() ?? Date.now()));
  } finally {
    await c.deleteEdit(edit).catch(() => {});
  }
}

const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

export function checkEditId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error(`"${id}" is not a Play edit id; use the id that shotsmith upload play --apply printed`);
}

// Recomputes the plan inside a new edit and stages it only when it matches the saved plan the user reviewed. The edit
// is kept, validated, only when it holds changes; nothing is live until commitPlay.
export async function applyPlay(cfg: ResolvedConfig, local: LocalSet[], saved: UploadPlan | null, deps: PlayDeps): Promise<UploadReport> {
  const pkg = playPackage(cfg);
  const c = new PlayClient(deps, pkg);
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const edit = await c.openEdit();
  let keepEdit = false;
  try {
    const { pairs, problems } = await readPlay(c, edit, local);
    if (problems.length) throw new Error(`The plan has problems, so nothing was changed:\n- ${problems.join("\n- ")}`);
    const fresh = makePlan({ store: "play", app: pkg, version: null, sets: pairs.map((p) => p.plan), problems }, new Date(now()));
    samePlan(cfg, saved, fresh);
    const report: UploadReport = {
      store: "play", app: pkg, version: null, digest: fresh.digest, editId: null,
      startedAt: new Date(now()).toISOString(), finishedAt: "", ok: false, error: null, sets: [],
    };
    try {
      for (const p of pairs) {
        // The record goes into the report first, so a failure still shows what was done to this set.
        const rec: AppliedSet = { locale: p.plan.locale, storeLocale: p.plan.storeLocale, target: p.plan.target, slot: p.plan.slot, status: "failed", deleted: [], uploaded: [], order: [] };
        report.sets.push(rec);
        await applyPlaySet(c, edit, p, rec, log);
      }
      if (report.sets.some((s) => s.status === "changed")) {
        await c.validate(edit);
        report.editId = edit;
        keepEdit = true;
      }
      report.ok = true;
    } catch (e) {
      report.error = (e as Error).message;
    }
    report.finishedAt = new Date(now()).toISOString();
    return report;
  } finally {
    if (!keepEdit) await c.deleteEdit(edit).catch(() => {});
  }
}

// Fills `rec` as it goes: on failure it keeps status "failed" and what was done so far.
async function applyPlaySet(c: PlayClient, edit: string, { plan: p, local }: PlayPair, rec: AppliedSet, log: (line: string) => void): Promise<void> {
  if (p.status === "unchanged") {
    rec.status = "unchanged";
    rec.order = p.keep.map((k, i) => ({ file: k.file, id: k.id, checksum: local.files[i].sha256 }));
    return;
  }
  const where = `${p.storeLocale} ${p.slot}`;
  try {
    // The edit is a draft: nothing reaches the listing until it is committed.
    await c.clear(edit, p.storeLocale, p.slot);
    rec.deleted = p.remove.map((r) => r.id);
    for (const f of local.files) {
      const bytes = fs.readFileSync(f.file);
      if (sha256(bytes) !== f.sha256) throw new Error(`${f.rel} changed after the plan was made; run the plan again`);
      const image = await c.upload(edit, p.storeLocale, p.slot, bytes);
      if (image.sha256 !== null && image.sha256 !== f.sha256) throw new Error(`Google Play stored ${f.rel} with a different checksum`);
      rec.uploaded.push({ file: f.rel, id: image.id });
      log(`${where}: uploaded ${f.rel}`);
    }
    const after = await c.images(edit, p.storeLocale, p.slot);
    if (after.map((i) => i.sha256).join() !== local.files.map((f) => f.sha256).join()) throw new Error("after the upload the edit differs from the export in order or content");
    rec.order = after.map((img, i) => ({ file: local.files[i].rel, id: img.id, checksum: local.files[i].sha256 }));
    rec.status = "changed";
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }
}

export async function commitPlay(cfg: ResolvedConfig, editId: string, deps: PlayDeps): Promise<{ editId: string; lines: string[] }> {
  checkEditId(editId);
  const c = new PlayClient(deps, playPackage(cfg));
  try {
    await c.commit(editId);
  } catch (e) {
    if (e instanceof StoreError && (e.status === 404 || /edit has been deleted/i.test(e.message))) {
      throw new Error(`Google Play no longer has edit ${editId}: an edit is discarded when anything else changes the app first, or when it expires. Run shotsmith upload play --apply again, show the user the result, and commit the new edit`);
    }
    throw e;
  }
  return {
    editId,
    lines: [`Committed edit ${editId}.`, "If managed publishing is on for this app, the changes now wait in Publishing overview in Play Console until someone publishes them."],
  };
}
