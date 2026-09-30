import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { templatesDir, version } from "../shared/paths.js";

const TEXT = /\.(json|md|html|txt)$|gitignore$/;
const CAPTURE = "inputs/iphone/en/home.png";
const PLACEHOLDERS = "inputs/.placeholders";

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

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

async function writeDefaultPlaceholder(file: string): Promise<void> {
  const label = Buffer.from(`<svg width="1179" height="2556" xmlns="http://www.w3.org/2000/svg"><rect width="1179" height="2556" fill="#eef1f5"/>
    <text x="589" y="1278" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#6b7480">Replace with your app's capture</text></svg>`);
  await sharp(label).png().toFile(file);
}

// Existence without following links, so a dangling symlink counts as taken.
const exists = (p: string): boolean => { try { fs.lstatSync(p); return true; } catch { return false; } };

export async function init(dir: string, o: { app?: string; install?: boolean; writePlaceholder?: (file: string) => Promise<void> } = {}): Promise<{ dir: string; files: string[] }> {
  const root = path.resolve(dir);
  if (exists(path.join(root, "shotsmith.config.json"))) throw new Error(`${root} already has a shotsmith.config.json`);
  const app = o.app ?? path.basename(root);
  const entries = templateFiles(path.join(templatesDir(), "init"));
  const taken = [...entries.map(([, r]) => r), CAPTURE, PLACEHOLDERS].filter((r) => exists(path.join(root, r)));
  if (taken.length) throw new Error(`Refusing to overwrite existing files in ${root}: ${taken.join(", ")}`);

  const files: string[] = [], madeDirs: string[] = [], madeFiles: string[] = [];
  const mkdir = (d: string) => { const first = fs.mkdirSync(d, { recursive: true }); if (first) madeDirs.push(first); };
  try {
    for (const [f, r] of entries) {
      const dest = path.join(root, r);
      mkdir(path.dirname(dest));
      madeFiles.push(dest);
      if (TEXT.test(f)) {
        const name = f.endsWith(".json") ? JSON.stringify(app).slice(1, -1) : app;
        fs.writeFileSync(dest, fs.readFileSync(f, "utf8").replaceAll("{{app}}", () => name).replaceAll("{{version}}", () => version()), { flag: "wx" });
      } else fs.copyFileSync(f, dest, fs.constants.COPYFILE_EXCL);
      files.push(r);
    }

    const capture = path.join(root, CAPTURE);
    mkdir(path.dirname(capture));
    madeFiles.push(capture);
    await (o.writePlaceholder ?? writeDefaultPlaceholder)(capture);
    files.push(CAPTURE);
    // `check` refuses any capture still matching one of these hashes, so a placeholder cannot ship by accident.
    const hash = createHash("sha256").update(fs.readFileSync(capture)).digest("hex");
    madeFiles.push(path.join(root, PLACEHOLDERS));
    fs.writeFileSync(path.join(root, PLACEHOLDERS), JSON.stringify([hash]) + "\n", { flag: "wx" });
    files.push(PLACEHOLDERS);
  } catch (e) {
    for (const f of madeFiles) fs.rmSync(f, { force: true });
    for (const d of madeDirs.reverse()) fs.rmSync(d, { recursive: true, force: true });
    throw e;
  }

  if (o.install !== false) {
    // npm's stdout goes to stderr so `--json` output stays parseable.
    try { execFileSync("npm", ["install"], { cwd: root, stdio: ["ignore", 2, 2], timeout: INSTALL_TIMEOUT_MS }); }
    catch { throw new Error(`Created ${root}, but npm install failed or took longer than 10 minutes. Run \`npm install\` in it manually.`); }
  }
  return { dir: root, files };
}
