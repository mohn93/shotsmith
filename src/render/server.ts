import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import stream from "node:stream";
import type { KitContext } from "../shared/context.js";
import { findSysFont } from "./fonts.js";

export interface RenderServer { url: string; close(): Promise<void> }

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".ttc": "font/collection", ".woff": "font/woff",
  ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".hdr": "application/octet-stream", ".glsl": "text/plain", ".mp4": "video/mp4",
};

export function importMapFor(root: string): Record<string, string> {
  const m: Record<string, string> = { "shotsmith/kit": "/__shotsmith/kit/index.js", "shotsmith/kit/three": "/__shotsmith/kit/three.js" };
  if (fs.existsSync(path.join(root, "node_modules/three/build/three.module.js"))) {
    m.three = "/node_modules/three/build/three.module.js";
    m["three/addons/"] = "/node_modules/three/examples/jsm/";
  }
  if (fs.existsSync(path.join(root, "node_modules/gsap/index.js"))) m.gsap = "/node_modules/gsap/index.js";
  return m;
}

const MAP_RE = /<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i;

export function injectImportMap(html: string, imports: Record<string, string>): string {
  const found = html.match(MAP_RE);
  if (found) {
    const page = JSON.parse(found[1].trim() || "{}");
    const merged = { ...page, imports: { ...imports, ...(page.imports ?? {}) } };
    return html.replace(MAP_RE, () => `<script type="importmap">${JSON.stringify(merged)}</script>`);
  }
  const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + tag) : tag + html;
}

function sendFile(res: http.ServerResponse, file: string, transform?: (s: string) => string): boolean {
  try {
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    if (transform) {
      const content = fs.readFileSync(file, "utf8");
      const transformed = transform(content);
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      res.end(transformed);
    } else {
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      stream.pipeline(fs.createReadStream(file), res, (err) => {
        if (err && !res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: `${path.basename(file)}: ${(err as Error).message}` }));
        } else if (err) {
          res.destroy();
        }
      });
    }
    return true;
  } catch (e) {
    const message = `${path.basename(file)}: ${(e as Error).message}`;
    if (res.headersSent) {
      res.destroy();
    } else {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return false;
  }
}

const inside = (root: string, p: string) => p === root || p.startsWith(root + path.sep);

export async function startServer(opts: { root: string; kitDir: string; context: (target: string, locale: string, page: string) => KitContext }): Promise<RenderServer> {
  const root = path.resolve(opts.root), kit = path.resolve(opts.kitDir);
  const server = http.createServer((req, res) => {
    const notFound = () => {
      if (res.headersSent) {
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    };
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/__shotsmith/context.json") {
        const q = url.searchParams;
        try {
          const body = JSON.stringify(opts.context(q.get("t") ?? "", q.get("l") ?? "", q.get("p") ?? ""));
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          return res.end(body);
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: (e as Error).message }));
        }
      }
      if (pathname.startsWith("/__shotsmith/kit/")) {
        const f = path.resolve(kit, "." + pathname.slice("/__shotsmith/kit".length));
        return inside(kit, f) && fs.existsSync(f) && fs.statSync(f).isFile() ? sendFile(res, f) : notFound();
      }
      if (pathname.startsWith("/sysfont/")) {
        const f = findSysFont(pathname.slice("/sysfont/".length));
        return f ? sendFile(res, f) : notFound();
      }
      const f = path.resolve(root, "." + pathname);
      if (!inside(root, f) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return notFound();
      if (f.endsWith(".html")) return sendFile(res, f, (html) => injectImportMap(html, importMapFor(root)));
      return sendFile(res, f);
    } catch {
      return notFound();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
