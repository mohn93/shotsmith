import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/schema.js";
import { type Finding, err } from "./findings.js";

const hasImages = (dir: string): boolean => fs.existsSync(dir) && fs.readdirSync(dir, { withFileTypes: true })
  .some((e) => (e.isDirectory() ? hasImages(path.join(dir, e.name)) : /\.(png|jpe?g|webp)$/i.test(e.name)));

export function checkInputs(cfg: ResolvedConfig): Finding[] {
  const platforms = [...new Set(cfg.targets.map((t) => t.platform))];
  return platforms.filter((p) => !hasImages(path.join(cfg.root, "inputs", p))).map((p) =>
    err("capture.platform", `No captures in inputs/${p}/. Captures never come from another platform; add ${p} captures or drop its targets`));
}
