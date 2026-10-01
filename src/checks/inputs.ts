import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/schema.js";
import { type Finding, err } from "./findings.js";

const hasImages = (dir: string): boolean => fs.existsSync(dir) && fs.readdirSync(dir, { withFileTypes: true })
  .some((e) => (e.isDirectory() ? hasImages(path.join(dir, e.name)) : /\.(png|jpe?g|webp)$/i.test(e.name)));

// init records the hash of the placeholder capture it writes; a capture still matching one has not been replaced.
function placeholderHashes(root: string): Set<string> {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(root, "inputs/.placeholders"), "utf8"));
    return new Set(Array.isArray(list) ? list.filter((h): h is string => typeof h === "string") : []);
  } catch { return new Set(); }
}

function captureFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? captureFiles(path.join(dir, e.name)) : /\.(png|jpe?g|webp)$/i.test(e.name) ? [path.join(dir, e.name)] : []);
}

export function checkInputs(cfg: ResolvedConfig): Finding[] {
  const platforms = [...new Set(cfg.targets.map((t) => t.platform))];
  const missing = platforms.filter((p) => !hasImages(path.join(cfg.root, "inputs", p))).map((p) =>
    err("capture.platform", `No captures in inputs/${p}/. Captures never come from another platform; add ${p} captures or drop its targets`));
  const hashes = placeholderHashes(cfg.root);
  // Only the platforms that have targets are rendered, so only their captures can ship.
  const placeholders = hashes.size === 0 ? [] : platforms.flatMap((p) => captureFiles(path.join(cfg.root, "inputs", p))).filter((f) => {
    try { return hashes.has(createHash("sha256").update(fs.readFileSync(f)).digest("hex")); } catch { return false; }
  }).map((f) => err("capture.placeholder", `${path.relative(cfg.root, f).split(path.sep).join("/")} is still the placeholder that init generated; replace it with a real capture, or delete it if this platform has no targets`));
  return [...missing, ...placeholders];
}
