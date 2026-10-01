import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { reachedWithoutLinks } from "../checks/store.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { Store } from "./local.js";

export type RemoveReason = "superseded" | "failed" | "processing" | "duplicate" | "replaced";
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
const STORE_NAME: Record<Store, string> = { apple: "App Store Connect", play: "Google Play" };
const REASONS: RemoveReason[] = ["superseded", "failed", "processing", "duplicate", "replaced"];

// What would change, without remote ids (Play hands out new ones per edit) or the time.
export function planDigest(p: PlanBody): string {
  const sets = p.sets.map((s) => ({ ...s, keep: s.keep.map((k) => k.file), remove: s.remove.map((r) => `${r.reason}:${r.checksum ?? ""}`) }));
  return crypto.createHash("sha256").update(JSON.stringify({ store: p.store, app: p.app, version: p.version, sets, problems: p.problems })).digest("hex");
}

export const makePlan = (p: PlanBody, now = new Date()): UploadPlan => ({ ...p, createdAt: now.toISOString(), digest: planDigest(p) });

export const planPath = (cfg: ResolvedConfig, store: Store): string => path.join(cfg.root, cfg.output, `upload-plan-${store}.json`);
export const reportPath = (cfg: ResolvedConfig, store: Store): string => path.join(cfg.root, cfg.output, `upload-report-${store}.json`);
const rel = (cfg: ResolvedConfig, p: string) => path.relative(cfg.root, p).split(path.sep).join("/");

// Same rule as build: nothing is written through a link.
export function writeJson(cfg: ResolvedConfig, file: string, data: unknown): string {
  const existing = (() => { try { return fs.lstatSync(file); } catch { return null; } })();
  if (!reachedWithoutLinks(cfg.root, path.dirname(file)) || (existing && !existing.isFile())) {
    throw new Error(`${rel(cfg, file)} is reached through a link or is not a file; Shotsmith does not write through it`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

export function readPlan(cfg: ResolvedConfig, store: Store): UploadPlan | null {
  try {
    const p = JSON.parse(fs.readFileSync(planPath(cfg, store), "utf8"));
    return p && p.store === store && typeof p.digest === "string" ? p : null;
  } catch {
    return null;
  }
}

// --apply does exactly the plan the user reviewed, or nothing.
export function samePlan(cfg: ResolvedConfig, saved: UploadPlan | null, fresh: UploadPlan): void {
  const cmd = `shotsmith upload ${fresh.store}`;
  if (!saved) throw new Error(`No saved plan at ${rel(cfg, planPath(cfg, fresh.store))}. Run ${cmd} without --apply, show the plan to the user, and apply only after they confirm`);
  if (saved.digest !== fresh.digest) {
    throw new Error(`What would change differs from the saved plan: the exports, the store, the locales or the version changed since. Nothing was changed. Run ${cmd} without --apply again, with the same options, and show the user the new plan`);
  }
}

const head = (s: { storeLocale: string; target: string; slot: string }) => `${s.storeLocale} ${s.target} (${s.slot})`;

export function describePlan(p: UploadPlan): string[] {
  const lines = [`${STORE_NAME[p.store]} plan for ${p.app}${p.version ? `, version ${p.version}` : ""}`];
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
    : s.status === "discarded" ? "discarded with the draft edit (listing unchanged)"
    : s.status === "failed" ? `failed after deleting ${s.deleted.length} and uploading ${s.uploaded.length}`
    : `deleted ${s.deleted.length}, uploaded ${s.uploaded.length}, ${s.order.length} in order and verified`;

export function describeReport(r: UploadReport): string[] {
  return r.sets.map((s) => `${head(s)}: ${describeApplied(s)}`);
}
