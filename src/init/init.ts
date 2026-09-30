import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { templatesDir, version } from "../shared/paths.js";

const TEXT = /\.(json|md|html|txt)$|gitignore$/;

export async function init(dir: string, o: { app?: string; install?: boolean } = {}): Promise<{ dir: string; files: string[] }> {
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, "shotsmith.config.json"))) throw new Error(`${root} already has a shotsmith.config.json`);
  const app = o.app ?? path.basename(root);
  const src = path.join(templatesDir(), "init");
  const files: string[] = [];
  const copy = (from: string, rel: string) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const f = path.join(from, e.name), r = path.join(rel, e.name === "gitignore" ? ".gitignore" : e.name);
      if (e.isDirectory()) { copy(f, r); continue; }
      const dest = path.join(root, r);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (TEXT.test(e.name)) fs.writeFileSync(dest, fs.readFileSync(f, "utf8").replaceAll("{{app}}", app).replaceAll("{{version}}", version()));
      else fs.copyFileSync(f, dest);
      files.push(r);
    }
  };
  copy(src, "");

  const capture = path.join(root, "inputs/iphone/en/home.png");
  fs.mkdirSync(path.dirname(capture), { recursive: true });
  const label = Buffer.from(`<svg width="1179" height="2556" xmlns="http://www.w3.org/2000/svg"><rect width="1179" height="2556" fill="#eef1f5"/>
    <text x="589" y="1278" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#6b7480">Replace with your app's capture</text></svg>`);
  await sharp(label).png().toFile(capture);
  files.push("inputs/iphone/en/home.png");

  if (o.install !== false) execFileSync("npm", ["install"], { cwd: root, stdio: "inherit" });
  return { dir: root, files };
}
