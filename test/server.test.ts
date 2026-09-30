import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectImportMap, startServer, type RenderServer } from "../src/render/server.js";

let root: string, kit: string, server: RenderServer;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "srv-"));
  kit = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));
  fs.mkdirSync(path.join(root, "pages"));
  fs.writeFileSync(path.join(root, "pages/a.html"), "<!doctype html><html><head><title>a</title></head><body></body></html>");
  fs.writeFileSync(path.join(kit, "index.js"), "export const k = 1;");
  const fontDir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-"));
  fs.writeFileSync(path.join(fontDir, "X.otf"), "font");
  process.env.FONT_DIRS = fontDir;
  server = await startServer({
    root, kitDir: kit,
    context: (t, l, p) => { if (t === "bad") throw new Error("Unknown target"); return { page: p, t, l } as never; },
  });
});
afterAll(async () => { await server.close(); delete process.env.FONT_DIRS; });

describe("render server", () => {
  it("injects the import map into pages", async () => {
    const html = await (await fetch(`${server.url}/pages/a.html`)).text();
    expect(html).toContain('"shotsmith/kit":"/__shotsmith/kit/index.js"');
    expect(html.indexOf("importmap")).toBeLessThan(html.indexOf("<title>"));
  });

  it("merges with a page import map, page entries winning", () => {
    const out = injectImportMap('<head><script type="importmap">{"imports":{"x":"/x.js","shotsmith/kit":"/mine.js"}}</script></head>', { "shotsmith/kit": "/k.js", y: "/y.js" });
    const map = JSON.parse(out.match(/importmap">(.*?)<\/script>/)![1]);
    expect(map.imports).toEqual({ "shotsmith/kit": "/mine.js", y: "/y.js", x: "/x.js" });
  });

  it("serves context, kit files and system fonts", async () => {
    expect(await (await fetch(`${server.url}/__shotsmith/context.json?t=iphone-6.9&l=en&p=a`)).json()).toEqual({ page: "a", t: "iphone-6.9", l: "en" });
    const bad = await fetch(`${server.url}/__shotsmith/context.json?t=bad&l=en&p=a`);
    expect(bad.status).toBe(500);
    expect((await bad.json()).error).toMatch(/Unknown target/);
    expect(await (await fetch(`${server.url}/__shotsmith/kit/index.js`)).text()).toContain("export const k");
    expect(await (await fetch(`${server.url}/sysfont/X.otf`)).text()).toBe("font");
    expect((await fetch(`${server.url}/sysfont/missing.otf`)).status).toBe(404);
  });

  it("refuses paths outside the workspace", async () => {
    expect((await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
    expect((await fetch(`${server.url}/pages`)).status).toBe(404);
  });
});
