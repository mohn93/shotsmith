import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ResolvedConfig } from "../config/schema.js";
import { isAcceptedAppleSize } from "../config/targets.js";
import { type Finding, type Where, err } from "./findings.js";

export const exportPath = (cfg: ResolvedConfig, locale: string, target: string, page: string, ext = "jpg"): string =>
  path.join(cfg.root, cfg.output, locale, target, `${page}.${ext}`);

const IMAGE = /\.(jpe?g|png)$/i;
// Finder writes these into any folder it opens; they are never uploaded.
const IGNORED = new Set([".DS_Store"]);

export interface StaleOutput { path: string; directory: boolean; where: Where }
export interface OutputScan {
  stale: StaleOutput[];
  // Every regular image file that is stale or inside a stale folder.
  images: string[];
  // Links at the output root, locale or target level: the output would be written somewhere else.
  linked: StaleOutput[];
}

const isRegularFile = (p: string): boolean => { try { return fs.lstatSync(p).isFile(); } catch { return false; } };
const exists = (p: string): boolean => { try { fs.lstatSync(p); return true; } catch { return false; } };

// True when p, or its nearest existing ancestor, is reached from the workspace root without passing through a link,
// so writing or deleting there stays inside the workspace.
export function reachedWithoutLinks(root: string, p: string): boolean {
  let q = path.resolve(p);
  while (!exists(q) && path.dirname(q) !== q) q = path.dirname(q);
  const rel = path.relative(path.resolve(root), q);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  try { return fs.realpathSync(q) === path.join(fs.realpathSync(root), rel); } catch { return false; }
}

// Throws when writing or deleting p would pass through a link (see reachedWithoutLinks), naming the path.
export function refuseLinked(root: string, p: string): void {
  if (reachedWithoutLinks(root, p)) return;
  const rel = path.relative(path.resolve(root), path.resolve(p));
  throw new Error(`${rel} is reached through a symbolic link (or leaves the workspace); Shotsmith never writes or deletes through a link, so nothing lands outside the workspace. Replace the link with a real folder.`);
}

// Every regular image file under dir, without following links.
function imagesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? imagesUnder(p) : e.isFile() && IMAGE.test(e.name) ? [p] : [];
  });
}

// Walks the output folder. Only <locale>/<target>/<page>.jpg and contact-sheets/<locale>-<target>.jpg for configured
// names, REPORT.md and upload-*.json belong there; anything else is stale, and a stale folder is reported once. A link
// at the output root, locale or target level is reported as linked and never walked.
export function staleOutputs(cfg: ResolvedConfig): OutputScan {
  const scan: OutputScan = { stale: [], images: [], linked: [] };
  const base = path.join(cfg.root, cfg.output);
  if (!exists(base)) return scan;
  if (!reachedWithoutLinks(cfg.root, base) || !fs.lstatSync(base).isDirectory()) {
    scan.linked.push({ path: base, directory: true, where: {} });
    return scan;
  }
  const add = (p: string, e: fs.Dirent, where: Where) => {
    if (IGNORED.has(e.name) && e.isFile()) return;
    scan.stale.push({ path: p, directory: e.isDirectory(), where });
    if (e.isDirectory()) scan.images.push(...imagesUnder(p));
    else if (e.isFile() && IMAGE.test(e.name)) scan.images.push(p);
  };
  const walk = (dir: string, where: Where, allowed: (e: fs.Dirent) => ((p: string) => void) | boolean, links = false) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (links && e.isSymbolicLink()) { scan.linked.push({ path: p, directory: false, where }); continue; }
      const ok = allowed(e);
      if (typeof ok === "function") ok(p);
      else if (!ok) add(p, e, where);
    }
  };
  const locales = new Set(cfg.locales.map((l) => l.code)), targets = new Set(cfg.targets.map((t) => t.name)), pages = new Set(cfg.pages);
  const sheets = new Set(cfg.locales.flatMap((l) => cfg.targets.map((t) => `${l.code}-${t.name}.jpg`)));
  walk(base, {}, (e) => {
    if (e.isFile()) return e.name === "REPORT.md" || /^upload-.+\.json$/.test(e.name);
    if (!e.isDirectory()) return false;
    if (e.name === "contact-sheets") return (p) => walk(p, {}, (s) => s.isFile() && sheets.has(s.name));
    if (!locales.has(e.name)) return false;
    const locale = e.name;
    return (p) => walk(p, { locale }, (t) => {
      if (!t.isDirectory() || !targets.has(t.name)) return false;
      const target = t.name;
      return (tp) => walk(tp, { locale, target }, (f) => f.isFile() && f.name.endsWith(".jpg") && pages.has(f.name.slice(0, -4)));
    }, true);
  }, true);
  return scan;
}

export async function checkExports(cfg: ResolvedConfig): Promise<Finding[]> {
  const out: Finding[] = [];
  const scan = staleOutputs(cfg);
  const rel = (p: string) => path.relative(cfg.root, p).split(path.sep).join("/");
  for (const s of scan.linked) {
    out.push(err("store.linked", `${rel(s.path)} is a link or leaves the workspace; Shotsmith does not write or delete through it. Use a real folder inside the workspace`, s.where));
  }
  for (const s of scan.stale) {
    out.push(err("store.stale", `${rel(s.path)}${s.directory ? "/" : ""} is not an export of a configured locale, target and page; delete it`, s.where));
  }
  for (const t of cfg.targets) {
    const play = t.store === "play";
    const limit = play ? 8 : 10;
    if (cfg.pages.length > limit) out.push(err("store.count", `${cfg.pages.length} screens; the ${play ? "Google Play" : "App Store"} limit is ${limit}`, { target: t.name }));
    if (Math.min(t.w, t.h) < 320 || Math.max(t.w, t.h) > 3840) out.push(err("store.sides", "each side must be 320 to 3840 px", { target: t.name }));
    if (play && Math.max(t.w, t.h) / Math.min(t.w, t.h) > 2) out.push(err("store.aspect", "aspect ratio over 2:1; Google Play rejects it", { target: t.name }));
    if ((t.platform === "iphone" || t.platform === "ipad") && !isAcceptedAppleSize(t.platform, t.w, t.h)) {
      out.push(err("store.appleSize", `${t.w}x${t.h} is not a screenshot size App Store Connect accepts for ${t.platform}`, { target: t.name }));
    }
    for (const l of cfg.locales) for (const page of cfg.pages) {
      const where = { locale: l.code, target: t.name, page };
      const file = exportPath(cfg, l.code, t.name, page);
      if (!isRegularFile(file)) { out.push(err("store.missing", "no exported image", where)); continue; }
      const m = await sharp(file).metadata().catch(() => null);
      if (!m) { out.push(err("store.format", "not an image sharp can read", where)); continue; }
      if (m.width !== t.w || m.height !== t.h) out.push(err("store.size", `${m.width}x${m.height}, expected ${t.w}x${t.h}`, where));
      if (m.hasAlpha || m.channels !== 3) out.push(err("store.alpha", `${m.channels} channels; stores need opaque RGB`, where));
      if (m.format !== "jpeg") out.push(err("store.format", `${m.format}; exports must be JPEG`, where));
      else {
        if (m.isProgressive) out.push(err("store.progressive", "progressive JPEG; App Store Connect leaves these unprocessed", where));
        if (m.chromaSubsampling !== "4:4:4") out.push(err("store.chroma", `chroma ${m.chromaSubsampling}, expected 4:4:4`, where));
      }
    }
  }
  return out;
}
