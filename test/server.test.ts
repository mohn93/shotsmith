import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectImportMap, startServer, type RenderServer } from "../src/render/server.js";
import { tempDir } from "./helpers.js";

let root: string, kit: string, server: RenderServer;

beforeAll(async () => {
  root = tempDir("srv-");
  kit = tempDir("kit-");
  fs.mkdirSync(path.join(root, "pages"));
  fs.writeFileSync(path.join(root, "pages/a.html"), "<!doctype html><html><head><title>a</title></head><body></body></html>");
  fs.writeFileSync(path.join(kit, "index.js"), "export const k = 1;");
  const fontDir = tempDir("sf-");
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

  it("refuses requests for any other host name (DNS rebinding)", async () => {
    const status = (host: string) => new Promise<number>((resolve, reject) => {
      http.get(`${server.url}/pages/a.html`, { headers: { host } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on("error", reject);
    });
    const port = new URL(server.url).port;
    expect(await status(`evil.example:${port}`)).toBe(403);
    expect(await status("127.0.0.1:1")).toBe(403);
    expect(await status(`127.0.0.1:${port}`)).toBe(200);
    expect(await status(`localhost:${port}`)).toBe(200);
  });

  it("returns 500 for malformed importmap JSON in a page", async () => {
    fs.writeFileSync(path.join(root, "pages/bad.html"), "<!doctype html><html><head><script type=\"importmap\">{invalid json}</script></head><body></body></html>");
    const res = await fetch(`${server.url}/pages/bad.html`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/bad\.html/);
  });

  it("survives a bad page and handles subsequent requests", async () => {
    expect(await (await fetch(`${server.url}/pages/a.html`)).text()).toContain("shotsmith/kit");
  });
});
