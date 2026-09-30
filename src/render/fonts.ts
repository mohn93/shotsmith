import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function fontDirs(): string[] {
  if (process.env.FONT_DIRS) return process.env.FONT_DIRS.split(":").filter(Boolean);
  const home = os.homedir();
  return [path.join(home, "Library/Fonts"), "/Library/Fonts", "/System/Library/Fonts",
    path.join(home, ".local/share/fonts"), "/usr/local/share/fonts", "/usr/share/fonts"];
}

// Bare file names only. Searches each dir and up to two levels below it (Linux font trees nest).
export function findSysFont(file: string): string | null {
  if (!/^[\w.-]+\.(otf|ttf|ttc|woff2?)$/i.test(file)) return null;
  const search = (dir: string, depth: number): string | null => {
    const direct = path.join(dir, file);
    if (fs.existsSync(direct)) return direct;
    if (depth === 0 || !fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { const hit = search(path.join(dir, e.name), depth - 1); if (hit) return hit; }
    }
    return null;
  };
  for (const d of fontDirs()) { const hit = search(d, 2); if (hit) return hit; }
  return null;
}
