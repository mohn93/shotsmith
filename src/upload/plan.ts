import fs from "node:fs";
import path from "node:path";
import { reachedWithoutLinks } from "../checks/store.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { Store } from "./local.js";
import { SERVICE_NAME, rel, sha256 } from "./util.js";

export type RemoveReason = "superseded" | "failed" | "processing" | "unfinished" | "duplicate" | "replaced";
export interface PlannedSet {
  locale: string;
  storeLocale: string;
  target: string;
  slot: string;
  status: "unchanged" | "change";
  keep: { id: string; file: string }[];
  // fileName: the remote file name, when the store gives one (App Store Connect); shown in the plan, not part of the digest.
  remove: { id: string; checksum: string | null; reason: RemoveReason; fileName?: string | null }[];
  // checksum: MD5 for App Store Connect, sha256 for Google Play.
  upload: { file: string; checksum: string }[];
  // Workspace-relative export files in their final order.
  order: string[];
}
export interface UploadPlan { store: Store; app: string; version: string | null; createdAt: string; digest: string; sets: PlannedSet[]; problems: string[] }
export interface AppliedSet {
  locale: string;
  storeLocale: string;
  target: string;
  slot: string;
  status: "unchanged" | "changed" | "failed" | "discarded";
  deleted: string[];
  uploaded: { file: string; id: string }[];
  order: { file: string; id: string; checksum: string }[];
}
export interface UploadReport {
  store: Store;
  app: string;
  version: string | null;
  digest: string;
  editId: string | null;
  // ISO time at which the kept Play edit expires; null for Apple and when no edit is kept, or the store gave none.
  editExpiresAt: string | null;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  error: string | null;
  sets: AppliedSet[];
}

type PlanBody = Omit<UploadPlan, "createdAt" | "digest">;
const REASONS: RemoveReason[] = ["superseded", "failed", "processing", "unfinished", "duplicate", "replaced"];

// What would change, without remote ids (Play hands out new ones per edit) or the time.
export function planDigest(p: PlanBody): string {
  const sets = p.sets.map((s) => ({ ...s, keep: s.keep.map((k) => k.file), remove: s.remove.map((r) => `${r.reason}:${r.checksum ?? ""}`) }));
  return sha256(JSON.stringify({ store: p.store, app: p.app, version: p.version, sets, problems: p.problems }));
}

export const makePlan = (p: PlanBody, now = new Date()): UploadPlan => ({ ...p, createdAt: now.toISOString(), digest: planDigest(p) });

export const planPath = (cfg: ResolvedConfig, store: Store): string => path.join(cfg.root, cfg.output, `upload-plan-${store}.json`);
export const reportPath = (cfg: ResolvedConfig, store: Store): string => path.join(cfg.root, cfg.output, `upload-report-${store}.json`);

const lstatOrNull = (file: string) => { try { return fs.lstatSync(file); } catch { return null; } };

// Same rule as build: nothing is written through a link.
function checkWritable(cfg: ResolvedConfig, file: string): void {
  const existing = lstatOrNull(file);
  if (!reachedWithoutLinks(cfg.root, path.dirname(file)) || (existing && !existing.isFile())) {
    throw new Error(`${rel(cfg, file)} is reached through a link or is not a file; Shotsmith does not write through it`);
  }
}

// Written to a temp file beside the target and renamed, so the target is never half written.
export function writeJson(cfg: ResolvedConfig, file: string, data: unknown): string {
  checkWritable(cfg, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return file;
}

// An earlier report must not pass for the report of an apply that did not run.
export function clearReport(cfg: ResolvedConfig, store: Store): void {
  const file = reportPath(cfg, store);
  if (!lstatOrNull(file)) return;
  checkWritable(cfg, file);
  fs.rmSync(file);
}

export function readPlan(cfg: ResolvedConfig, store: Store): UploadPlan | null {
  try {
    const p = JSON.parse(fs.readFileSync(planPath(cfg, store), "utf8"));
    const text = (k: string) => typeof p[k] === "string";
    const ok = p && p.store === store && ["app", "digest", "createdAt"].every(text) && (p.version === null || text("version")) && Array.isArray(p.sets) && Array.isArray(p.problems);
    return ok ? p : null;
  } catch {
    return null;
  }
}

// The report of the last apply; null when there is none, "unreadable" when the file is not a report.
export function readReport(cfg: ResolvedConfig, store: Store): UploadReport | "unreadable" | null {
  const file = reportPath(cfg, store);
  if (!lstatOrNull(file)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    return r && r.store === store && (r.editId === null || typeof r.editId === "string") ? r : "unreadable";
  } catch {
    return "unreadable";
  }
}

const noPlan = (cfg: ResolvedConfig, store: Store) => new Error(`No saved plan at ${rel(cfg, planPath(cfg, store))}. Run shotsmith upload ${store} without --apply, show the plan to the user, and apply only after they confirm`);

export function requirePlan(cfg: ResolvedConfig, store: Store): UploadPlan {
  const saved = readPlan(cfg, store);
  if (!saved) throw noPlan(cfg, store);
  return saved;
}

// --apply does exactly the plan the user reviewed, or nothing.
export function samePlan(cfg: ResolvedConfig, saved: UploadPlan | null, fresh: UploadPlan): void {
  const cmd = `shotsmith upload ${fresh.store}`;
  if (!saved) throw noPlan(cfg, fresh.store);
  if (saved.digest !== fresh.digest) {
    throw new Error(`What would change differs from the saved plan: the exports, the store, the locales or the version changed since. Nothing was changed. Run ${cmd} without --apply again, with the same options, and show the user the new plan`);
  }
}

const head = (s: { storeLocale: string; target: string; slot: string }) => `${s.storeLocale} ${s.target} (${s.slot})`;

export function describePlan(p: UploadPlan): string[] {
  const lines = [`${SERVICE_NAME[p.store]} plan for ${p.app}${p.version ? `, version ${p.version}` : ""}`];
  for (const s of p.sets) {
    if (s.status === "unchanged") { lines.push(`${head(s)}: unchanged`); continue; }
    const why = REASONS.map((r) => [r, s.remove.filter((x) => x.reason === r).length] as const).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(", ");
    lines.push(`${head(s)}: keep ${s.keep.length}, delete ${s.remove.length}${why ? ` (${why})` : ""}, upload ${s.upload.length}`);
    const names = s.remove.map((x) => x.fileName).filter((n): n is string => !!n);
    if (names.length) lines.push(`  delete: ${names.join(", ")}`);
    lines.push(`  order: ${s.order.map((f) => path.posix.basename(f)).join(", ")}`);
  }
  for (const problem of p.problems) lines.push(`problem: ${problem}`);
  return lines;
}

const describeApplied = (s: AppliedSet): string =>
  s.status === "unchanged" ? "unchanged"
    : s.status === "discarded" ? "not applied; the Google Play listing is unchanged"
    : s.status === "failed" ? `failed after deleting ${s.deleted.length} and uploading ${s.uploaded.length}`
    : `deleted ${s.deleted.length}, uploaded ${s.uploaded.length}, ${s.order.length} in order and verified`;

export function describeReport(r: UploadReport): string[] {
  return r.sets.map((s) => `${head(s)}: ${describeApplied(s)}`);
}
