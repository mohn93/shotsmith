import type { ResolvedConfig } from "../config/schema.js";
import { type AppleDeps, appleApp, applyApple, planApple } from "./apple.js";
import { localSets } from "./local.js";
import { type UploadPlan, type UploadReport, describePlan, describeReport, makePlan, planPath, reportPath, requirePlan, startReport, writeJson } from "./plan.js";
import { type PlayDeps, applyPlay, checkCommit, commitPlay, planPlay, playPackage } from "./play.js";
import { SERVICE_NAME, rel } from "./util.js";

export interface UploadOptions { locales?: string[]; version?: string; apply?: boolean; commit?: string; notSentForReview?: boolean }
export interface UploadOutcome { ok: boolean; exitCode: 0 | 1 | 2; lines: string[]; json: Record<string, unknown> }

// Export problems under --apply are only reported: the saved plan is the one the user reviewed, so it is not replaced.
function planOutcome(cfg: ResolvedConfig, plan: UploadPlan, next: string, save = true): UploadOutcome {
  const file = save ? rel(cfg, writeJson(cfg, planPath(cfg, plan.store), plan)) : null;
  const written = file ? `Plan written to ${file}. ` : "";
  const json = file ? { plan, planFile: file } : { plan };
  const done = (ok: boolean, exitCode: 0 | 1, last: string): UploadOutcome => ({ ok, exitCode, lines: [...describePlan(plan), `${written}${last}`], json });
  if (plan.problems.length) return done(false, 1, "Fix the problems above before uploading; nothing was changed.");
  if (plan.sets.every((s) => s.status === "unchanged")) return done(true, 0, "The store already matches the exports; nothing to upload.");
  return done(true, 0, `Nothing was changed. Show this plan to the user; ${next}`);
}

const touched = (report: UploadReport) => report.sets.some((s) => s.changedStore);
// A store write that deleted and uploaded nothing created a set or reordered one (or left a reservation).
const onlyCreatedOrReordered = (report: UploadReport) => report.sets.every((s) => !s.deleted.length && !s.uploaded.length);

// A failed apply still leaves its report and says what it did before it stopped, then fails the command (exit 2).
function reportOutcome(cfg: ResolvedConfig, report: UploadReport, last: string[]): UploadOutcome {
  const file = rel(cfg, writeJson(cfg, reportPath(cfg, report.store), report));
  if (!report.ok) {
    const partly = report.store !== "apple" ? []
      : touched(report)
        ? [`App Store Connect was partly changed: ${onlyCreatedOrReordered(report) ? "a screenshot set was created or reordered before the failure, and the version" : "the screenshots listed above were deleted or uploaded and stay in the version, which"} may now be incomplete. Sets not listed were not touched. Run shotsmith upload apple again with the same options, show the user the new plan, and apply after they confirm. Do not submit the version until then.`]
        : [`Nothing was changed in ${SERVICE_NAME.apple}.`];
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
  if (scan.problems.length) return planOutcome(cfg, makePlan({ store: "apple", app, version: null, sets: [], problems: scan.problems }), "", !o.apply);
  const saved = o.apply ? requirePlan(cfg, "apple") : null;
  if (saved) startReport(cfg, "apple", app);
  const deps = connect();
  if (!saved) return planOutcome(cfg, (await planApple(cfg, scan.sets, { version: o.version }, deps)).plan, "run again with --apply only after they confirm.");
  const report = await applyApple(cfg, scan.sets, { version: o.version }, saved, deps);
  return reportOutcome(cfg, report, ["Nothing was submitted for review."]);
}

export async function runPlay(cfg: ResolvedConfig, o: UploadOptions, connect: () => PlayDeps): Promise<UploadOutcome> {
  const app = playPackage(cfg);
  if (o.apply && o.commit !== undefined) throw new Error("Use either --apply or --commit, not both");
  if (o.commit !== undefined && o.locales?.length) throw new Error("-l does not apply to --commit");
  if (o.notSentForReview && o.commit === undefined) throw new Error("--changes-not-sent-for-review only applies to --commit");
  if (o.commit !== undefined) {
    checkCommit(cfg, o.commit);
    const res = await commitPlay(cfg, o.commit, { notSentForReview: o.notSentForReview, skipCheck: true }, connect());
    return { ok: true, exitCode: 0, lines: res.lines, json: { committed: res.editId } };
  }
  const scan = await localSets(cfg, "play", { locales: o.locales });
  if (scan.problems.length) return planOutcome(cfg, makePlan({ store: "play", app, version: null, sets: [], problems: scan.problems }), "", !o.apply);
  const saved = o.apply ? requirePlan(cfg, "play") : null;
  if (saved) startReport(cfg, "play", app);
  const deps = connect();
  if (!saved) return planOutcome(cfg, await planPlay(cfg, scan.sets, deps), "run again with --apply to stage the changes in a draft edit after they confirm; nothing goes live until --commit.");
  const report = await applyPlay(cfg, scan.sets, saved, deps);
  return reportOutcome(cfg, report, report.editId
    ? [`Staged and validated in draft edit ${report.editId}${report.editExpiresAt ? ` (expires ${report.editExpiresAt})` : ""}; nothing is live yet. After the user confirms, run: shotsmith upload play --commit ${report.editId}`]
    : ["Nothing to change; no edit was kept."]);
}
