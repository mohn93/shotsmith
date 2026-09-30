import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../../config/schema.js";
import { openRenderer, outPath, renderPage, renderVideo } from "../../render/render.js";
import { globals } from "../output.js";

export function registerRender(program: Command) {
  program.command("render <page>")
    .description("render one page for one target and locale")
    .option("-t, --target <name>", "target (default: first configured)")
    .option("-l, --locale <code>", "locale (default: first configured)")
    .option("-o, --out <file>", "output file (default: out/<locale>/<target>/<page>.png)")
    .option("--video", "render an MP4 through window.__seek")
    .option("--fps <n>", "video frames per second", "30")
    .option("--duration <s>", "video seconds", "6")
    .action(async (page: string, o, cmd: Command) => {
      const g = globals(cmd);
      if (!/^[\w-]+$/.test(page)) throw new Error(`Page name "${page}" must use letters, digits, - and _ only; it names pages/<page>.html`);
      const cfg = loadConfig(g.cwd);
      const target = o.target ?? cfg.targets[0].name, locale = o.locale ?? cfg.defaultLocale;
      if (!cfg.targets.some((t) => t.name === target)) throw new Error(`Unknown target "${target}"; configured: ${cfg.targets.map((t) => t.name).join(", ")}`);
      if (!cfg.locales.some((l) => l.code === locale)) throw new Error(`Unknown locale "${locale}"; configured: ${cfg.locales.map((l) => l.code).join(", ")}`);
      const out = o.out ? path.resolve(o.out) : o.video ? outPath(cfg, locale, target, page).replace(/\.png$/, ".mp4") : outPath(cfg, locale, target, page);
      if (!o.video && !/\.png$/.test(out)) throw new Error(`--out must end in .png for a still render (its sidecar is written next to it as .json); got ${o.out}`);
      const r = await openRenderer(cfg);
      try {
        if (o.video) { await renderVideo(r, { page, target, locale, out }, { fps: Number(o.fps), duration: Number(o.duration) }); console.log(g.json ? JSON.stringify({ out }) : `wrote ${out}`); return; }
        const res = await renderPage(r, { page, target, locale, out });
        if (g.json) console.log(JSON.stringify({ out, sidecar: res.sidecarPath, warnings: res.sidecar.warnings, ms: res.ms }));
        else { console.log(`wrote ${out} (${res.ms} ms)`); for (const w of res.sidecar.warnings) console.log(`warn ${w}`); }
      } finally { await r.close(); }
    });
}
