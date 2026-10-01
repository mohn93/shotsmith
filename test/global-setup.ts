import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return newest;
}

export default function setup(): void {
  fs.rmSync(path.join(ROOT, "test/.tmp"), { recursive: true, force: true });
  const newestSrc = newestMtime(path.join(ROOT, "src"));
  for (const built of ["dist/cli.js", "dist/kit/index.js"]) {
    const file = path.join(ROOT, built);
    if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < newestSrc) {
      throw new Error("dist is older than src; run npm run build");
    }
  }
}
