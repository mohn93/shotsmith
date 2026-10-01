import path from "node:path";
import type { ResolvedConfig } from "../config/schema.js";
import { type AppleDeps, appleApp, applyApple, planApple } from "./apple.js";
import { localSets } from "./local.js";
import { type UploadPlan, type UploadReport, describePlan, describeReport, makePlan, planPath, readPlan, reportPath, writeJson } from "./plan.js";
import { type PlayDeps, applyPlay, checkEditId, commitPlay, planPlay, playPackage } from "./play.js";

export interface UploadOptions { locales?: string[]; version?: string; apply?: boolean; commit?: string }
export interface UploadOutcome { ok: boolean; exitCode: 0 | 1 | 2; lines: string[]; json: Record<string, unknown> }

const rel = (cfg: ResolvedConfig, p: string) => path.relative(cfg.root, p).split(path.sep).join("/");

function planOutcome(cfg: ResolvedConfig, plan: UploadPlan, next: string): UploadOutcome {
  const file = rel(cfg, writeJson(cfg, planPath(cfg, plan.store), plan));
  if (plan.problems.length) {
    return { ok: false, exitCode: 1, lines: [...describePlan(plan), `Plan written to ${file}. Fix the problems above before uploading; nothing was changed.`], json: { plan, planFile: file } };
  }
  if (plan.sets.every((s) => s.status === "unchanged")) {
    return { ok: true, exitCode: 0, lines: [...describePlan(plan), `Plan written to ${file}. The store already matches the exports; nothing to upload.`], json: { plan, planFile: file } };
  }
  return { ok: true, exitCode: 0, lines: [...describePlan(plan), `Plan written to ${file}. Nothing was changed. Show this plan to the user; ${next}`], json: { plan, planFile: file } };
}

// A failed apply still leaves its report and says what it did before it stopped, then fails the command (exit 2).
function reportOutcome(cfg: ResolvedConfig, report: UploadReport, last: string[]): UploadOutcome {
  const file = rel(cfg, writeJson(cfg, reportPath(cfg, report.store), report));
  if (!report.ok) {
    const partly = report.store === "apple"
      ? ["App Store Connect was partly changed: the screenshots listed above were deleted or uploaded and stay in the version, which may now be incomplete. Sets not listed were not touched. Run shotsmith upload apple again with the same options, show the user the new plan, and apply after they confirm. Do not submit the version until then."]
      : [];
    return {
      ok: false, exitCode: 2,
      lines: [...describeReport(report), ...partly, `Upload failed: ${report.error}`, `Report written to ${file}.`],
      json: { error: { message: `${report.error} (report: ${file})` }, report, reportFile: file },
    };
  }
  return { ok: true, exitCode: 0, lines: [...describeReport(report), `Report written to ${file}.`, ...last], json: { report, reportFile: file } };
}

// connect() is called only once the exports pass, so problems are reported without credentials.
export async function runApple(cfg: ResolvedConfig, o: UploadOptions, connect: () => AppleDeps): Promise<UploadOutcome> {
  const app = appleApp(cfg);
  const scan = await localSets(cfg, "apple", { locales: o.locales });
  if (scan.problems.length) return planOutcome(cfg, makePlan({ store: "apple", app, version: null, sets: [], problems: scan.problems }), "");
  const deps = connect();
  if (!o.apply) return planOutcome(cfg, (await planApple(cfg, scan.sets, { version: o.version }, deps)).plan, "run again with --apply only after they confirm.");
  const report = await applyApple(cfg, scan.sets, { version: o.version }, readPlan(cfg, "apple"), deps);
  return reportOutcome(cfg, report, ["Nothing was submitted for review."]);
}

export async function runPlay(cfg: ResolvedConfig, o: UploadOptions, connect: () => PlayDeps): Promise<UploadOutcome> {
  const app = playPackage(cfg);
  if (o.apply && o.commit !== undefined) throw new Error("Use either --apply or --commit, not both");
  if (o.commit !== undefined) {
    checkEditId(o.commit);
    const res = await commitPlay(cfg, o.commit, connect());
    return { ok: true, exitCode: 0, lines: res.lines, json: { committed: res.editId } };
  }
  const scan = await localSets(cfg, "play", { locales: o.locales });
  if (scan.problems.length) return planOutcome(cfg, makePlan({ store: "play", app, version: null, sets: [], problems: scan.problems }), "");
  const deps = connect();
  if (!o.apply) return planOutcome(cfg, await planPlay(cfg, scan.sets, deps), "run again with --apply to stage the changes in a draft edit after they confirm; nothing goes live until --commit.");
  const report = await applyPlay(cfg, scan.sets, readPlan(cfg, "play"), deps);
  return reportOutcome(cfg, report, report.editId
    ? [`Staged and validated in draft edit ${report.editId}${report.editExpiresAt ? ` (expires ${report.editExpiresAt})` : ""}; nothing is live yet. After the user confirms, run: shotsmith upload play --commit ${report.editId}`]
    : ["Nothing to change; no edit was kept."]);
}
