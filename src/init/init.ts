import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { templatesDir, version } from "../shared/paths.js";

const TEXT = /\.(json|md|html|txt)$|gitignore$/;
const CAPTURE = "inputs/iphone/en/home.png";

// Every template file as [source path, destination path relative to the workspace].
function templateFiles(from: string, rel = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, e.name), r = path.join(rel, e.name === "gitignore" ? ".gitignore" : e.name);
    if (e.isDirectory()) out.push(...templateFiles(f, r));
    else out.push([f, r]);
  }
  return out;
}

export async function init(dir: string, o: { app?: string; install?: boolean } = {}): Promise<{ dir: string; files: string[] }> {
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, "shotsmith.config.json"))) throw new Error(`${root} already has a shotsmith.config.json`);
  const app = o.app ?? path.basename(root);
  const entries = templateFiles(path.join(templatesDir(), "init"));
  const taken = [...entries.map(([, r]) => r), CAPTURE].filter((r) => fs.existsSync(path.join(root, r)));
  if (taken.length) throw new Error(`Refusing to overwrite existing files in ${root}: ${taken.join(", ")}`);

  const files: string[] = [];
  for (const [f, r] of entries) {
    const dest = path.join(root, r);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (TEXT.test(f)) {
      const name = f.endsWith(".json") ? JSON.stringify(app).slice(1, -1) : app;
      fs.writeFileSync(dest, fs.readFileSync(f, "utf8").replaceAll("{{app}}", () => name).replaceAll("{{version}}", () => version()));
    } else fs.copyFileSync(f, dest);
    files.push(r);
  }

  const capture = path.join(root, CAPTURE);
  fs.mkdirSync(path.dirname(capture), { recursive: true });
  const label = Buffer.from(`<svg width="1179" height="2556" xmlns="http://www.w3.org/2000/svg"><rect width="1179" height="2556" fill="#eef1f5"/>
    <text x="589" y="1278" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#6b7480">Replace with your app's capture</text></svg>`);
  await sharp(label).png().toFile(capture);
  files.push(CAPTURE);

  if (o.install !== false) {
    // npm's stdout goes to stderr so `--json` output stays parseable.
    try { execFileSync("npm", ["install"], { cwd: root, stdio: ["ignore", 2, 2] }); }
    catch { throw new Error(`Created ${root}, but npm install failed. Run \`npm install\` in it manually.`); }
  }
  return { dir: root, files };
}
