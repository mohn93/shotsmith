import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { encodeJpeg } from "../../src/build/export.js";
import { exportPath } from "../../src/checks/store.js";
import { type ResolvedConfig, loadConfig } from "../../src/config/schema.js";
import { tempDir } from "../helpers.js";

export interface WorkspaceOptions {
  targets?: unknown[];
  locales?: { code: string; apple?: string; play?: string }[];
  pages?: string[];
  apple?: boolean;
  play?: boolean;
  // false: no exports are written.
  export?: boolean;
}

// A workspace whose exports pass every store check, without rendering anything.
export async function uploadWorkspace(o: WorkspaceOptions = {}): Promise<ResolvedConfig> {
  const ws = tempDir("upload-");
  const config = {
    app: "Demo",
    ...(o.apple === false ? {} : { apple: { bundleId: "com.example.demo" } }),
    ...(o.play === false ? {} : { play: { packageName: "com.example.demo" } }),
    pages: o.pages ?? ["01-a", "02-b"],
    targets: o.targets ?? ["iphone-6.9", "android-phone"],
    locales: o.locales ?? [{ code: "en", apple: "en-US", play: "en-US" }, { code: "de", apple: "de-DE", play: "de-DE" }],
  };
  fs.writeFileSync(path.join(ws, "shotsmith.config.json"), JSON.stringify(config));
  const cfg = loadConfig(ws);
  if (o.export !== false) for (const l of cfg.locales) for (const t of cfg.targets) for (const page of cfg.pages) await paint(cfg, l.code, t.name, page, 0);
  return cfg;
}

// Writes one export as a store-valid JPEG in a colour unique to its locale, target, page and shade.
export async function paint(cfg: ResolvedConfig, locale: string, target: string, page: string, shade: number): Promise<void> {
  const t = cfg.targets.find((x) => x.name === target)!;
  const li = cfg.locales.findIndex((l) => l.code === locale), ti = cfg.targets.indexOf(t), pi = cfg.pages.indexOf(page);
  const png = path.join(cfg.root, "out", "paint.png");
  fs.mkdirSync(path.dirname(png), { recursive: true });
  await sharp({ create: { width: t.w, height: t.h, channels: 3, background: { r: 20 + 40 * li, g: 20 + 40 * ti + shade, b: 20 + 30 * pi } } }).png().toFile(png);
  await encodeJpeg(png, exportPath(cfg, locale, target, page));
}
