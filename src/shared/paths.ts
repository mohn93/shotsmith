import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

// Works from src/ (tests) and dist/ (installed package): walk up to shotsmith's package.json.
export function packageRoot(): string {
  if (cached) return cached;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const file = path.join(dir, "package.json");
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).name === "shotsmith") return (cached = dir);
    const up = path.dirname(dir);
    if (up === dir) throw new Error("shotsmith package root not found");
    dir = up;
  }
}

export const version = (): string => JSON.parse(fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")).version;
export const kitDir = (): string => path.join(packageRoot(), "dist", "kit");
export const templatesDir = (): string => path.join(packageRoot(), "templates");
