import fs from "node:fs";
import path from "node:path";
import { checkClaims } from "../checks/claims.js";
import { type Finding, type Where, err, formatFinding } from "../checks/findings.js";
import { checkInputs } from "../checks/inputs.js";
import { checkSidecars, loadSidecars } from "../checks/sidecars.js";
import { checkExports, exportPath, reachedWithoutLinks, staleOutputs } from "../checks/store.js";
import { loadClaims } from "../config/claims.js";
import type { ResolvedConfig } from "../config/schema.js";
import { type RenderJob, type RenderResult, openRenderer, outPath, renderPage } from "../render/render.js";
import { version } from "../shared/paths.js";
import { contactSheet, encodeJpeg } from "./export.js";

export interface BuildOptions { targets?: string[]; locales?: string[]; jobs?: number }
export interface BuildResult { rendered: RenderResult[]; failures: { job: RenderJob; error: string }[]; findings: Finding[]; report: string }

const lstatOrNull = (p: string): fs.Stats | null => { try { return fs.lstatSync(p); } catch { return null; } };

// Removes dir and the folders inside it that are empty, bottom up, never following links. A folder holding only
// Finder's .DS_Store counts as empty; that file goes with it. No other file is removed.
function removeEmptyFolders(dir: string): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) removeEmptyFolders(path.join(dir, e.name));
  const left = fs.readdirSync(dir, { withFileTypes: true });
  if (!left.every((e) => e.isFile() && e.name === ".DS_Store")) return;
  for (const e of left) fs.rmSync(path.join(dir, e.name));
  fs.rmdirSync(dir);
}

export async function build(cfg: ResolvedConfig, o: BuildOptions = {}): Promise<BuildResult> {
  const unknownTargets = (o.targets ?? []).filter((n) => !cfg.targets.some((t) => t.name === n));
  if (unknownTargets.length) throw new Error(`Unknown target(s): ${unknownTargets.join(", ")}; configured: ${cfg.targets.map((t) => t.name).join(", ")}`);
  const unknownLocales = (o.locales ?? []).filter((c) => !cfg.locales.some((l) => l.code === c));
  if (unknownLocales.length) throw new Error(`Unknown locale(s): ${unknownLocales.join(", ")}; configured: ${cfg.locales.map((l) => l.code).join(", ")}`);
  const targets = cfg.targets.filter((t) => !o.targets?.length || o.targets.includes(t.name));
  const locales = cfg.locales.filter((l) => !o.locales?.length || o.locales.includes(l.code));
  const jobs: RenderJob[] = locales.flatMap((l) => targets.flatMap((t) => cfg.pages.map((page) => ({ page, target: t.name, locale: l.code, out: outPath(cfg, l.code, t.name, page) }))));
  const rendered: RenderResult[] = [], failures: BuildResult["failures"] = [];

  const r = await openRenderer(cfg);
  try {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try { rendered.push(await renderPage(r, job)); } catch (e) { failures.push({ job, error: (e as Error).message }); }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, o.jobs ?? 4) }, worker));
  } finally {
    await r.close();
  }

  // Nothing is written or deleted in a folder reached through a link (checkExports reports it as store.linked).
  const safe = (file: string) => reachedWithoutLinks(cfg.root, path.dirname(file));
  // Stale image files anywhere in the output folder go, then the folders of removed locales and targets if that left
  // them empty. Other stale files and folders are only reported.
  const scan = staleOutputs(cfg);
  for (const f of scan.images) if (safe(f)) fs.rmSync(f);
  for (const s of scan.stale) if (s.directory && !s.where.target && safe(s.path)) removeEmptyFolders(s.path);
  for (const l of locales) for (const t of targets) {
    const pngs: string[] = [];
    for (const page of cfg.pages) {
      const png = outPath(cfg, l.code, t.name, page), jpg = exportPath(cfg, l.code, t.name, page);
      if (!safe(jpg)) continue;
      const kind = lstatOrNull(jpg);
      // A folder in the way is reported as stale; the export is then missing.
      if (kind?.isDirectory()) continue;
      // Never write through a link to somewhere else.
      if (kind && !kind.isFile()) fs.unlinkSync(jpg);
      if (!rendered.some((x) => x.out === png)) {
        // The page failed to render; drop its old export so check reports it missing.
        if (kind?.isFile()) fs.rmSync(jpg);
        continue;
      }
      await encodeJpeg(png, jpg);
      pngs.push(png);
    }
    const sheet = path.join(cfg.root, cfg.output, "contact-sheets", `${l.code}-${t.name}.jpg`);
    if (!safe(sheet)) continue;
    const sheetKind = lstatOrNull(sheet);
    if (sheetKind?.isDirectory()) continue;
    if (sheetKind && !sheetKind.isFile()) fs.unlinkSync(sheet);
    if (pngs.length) await contactSheet(pngs, sheet);
    else if (sheetKind?.isFile()) fs.rmSync(sheet);
  }

  const scope = (f: Where) => (!f.locale || locales.some((l) => l.code === f.locale)) && (!f.target || targets.some((t) => t.name === f.target));
  const { sidecars, findings: missing } = loadSidecars(cfg);
  const findings = [
    // Only the platforms of the targets being built need captures.
    ...checkInputs({ ...cfg, targets }),
    ...failures.map((f) => err("render.failed", f.error.split("\n")[0], { locale: f.job.locale, target: f.job.target, page: f.job.page })),
    ...missing.filter(scope).filter((m) => !failures.some((f) => f.job.page === m.page && f.job.target === m.target && f.job.locale === m.locale)),
    ...checkSidecars(cfg, sidecars.filter((s) => scope(s))),
    ...checkClaims(cfg, loadClaims(cfg.root), sidecars.filter((s) => scope(s))).filter((f) => f.rule !== "claims.unused" || (!o.targets?.length && !o.locales?.length)),
    ...(await checkExports(cfg)).filter(scope),
  ];
  const report = writeReport(cfg, jobs, rendered, findings);
  return { rendered, failures, findings, report };
}

function writeReport(cfg: ResolvedConfig, jobs: RenderJob[], rendered: RenderResult[], findings: Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error"), warnings = findings.filter((f) => f.severity === "warning");
  const status = (j: RenderJob) => {
    if (!rendered.some((r) => r.out === j.out)) return "failed";
    return errors.some((f) => f.page === j.page && f.target === j.target && f.locale === j.locale) ? "errors" : "ok";
  };
  const lines = [
    "# Shotsmith build report", "",
    `Built ${new Date().toISOString()} with shotsmith ${version()}.`, "",
    "| Locale | Target | Page | Status |", "| --- | --- | --- | --- |",
    ...jobs.map((j) => `| ${j.locale} | ${j.target} | ${j.page} | ${status(j)} |`), "",
    errors.length ? `## Errors (${errors.length})` : "No errors.", "",
    ...errors.map((f) => `- ${formatFinding(f)}`), "",
    warnings.length ? `## Warnings (${warnings.length})` : "No warnings.", "",
    ...warnings.map((f) => `- ${formatFinding(f)}`), "",
  ];
  const file = path.join(cfg.root, cfg.output, "REPORT.md");
  // A linked output folder or REPORT.md is reported as store.linked; the report is not written through it.
  if (!reachedWithoutLinks(cfg.root, path.dirname(file))) return "";
  const existing = lstatOrNull(file);
  if (existing && !existing.isFile()) return "";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}
