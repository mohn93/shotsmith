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
      const cfg = loadConfig(g.cwd);
      const target = o.target ?? cfg.targets[0].name, locale = o.locale ?? cfg.defaultLocale;
      const out = o.out ? path.resolve(o.out) : o.video ? outPath(cfg, locale, target, page).replace(/\.png$/, ".mp4") : outPath(cfg, locale, target, page);
      const r = await openRenderer(cfg);
      try {
        if (o.video) { await renderVideo(r, { page, target, locale, out }, { fps: Number(o.fps), duration: Number(o.duration) }); console.log(g.json ? JSON.stringify({ out }) : `wrote ${out}`); return; }
        const res = await renderPage(r, { page, target, locale, out });
        if (g.json) console.log(JSON.stringify({ out, sidecar: res.sidecarPath, warnings: res.sidecar.warnings, ms: res.ms }));
        else { console.log(`wrote ${out} (${res.ms} ms)`); for (const w of res.sidecar.warnings) console.log(`warn ${w}`); }
      } finally { await r.close(); }
    });
}
