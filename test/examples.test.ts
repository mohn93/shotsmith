import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkInputs } from "../src/checks/inputs.js";
import { loadClaims, validateClaims } from "../src/config/claims.js";
import { loadConfig } from "../src/config/schema.js";
import { ROOT } from "./helpers.js";

const DIR = path.join(ROOT, "examples");
const apps = fs.readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(DIR, e.name, "shotsmith.config.json")))
  .map((e) => e.name).sort();
const ignored = (rel: string) => { try { execFileSync("git", ["check-ignore", "-q", rel], { cwd: ROOT }); return true; } catch { return false; } };

describe("examples", () => {
  it("exist", () => expect(apps.length).toBeGreaterThan(0));

  for (const app of apps) describe(app, () => {
    const root = path.join(DIR, app);
    it("targets iPhone 6.9 and Android phone in English and German", () => {
      const cfg = loadConfig(root);
      expect(cfg.targets.map((t) => t.name)).toEqual(["iphone-6.9", "android-phone"]);
      expect(cfg.locales.map((l) => [l.code, l.apple, l.play])).toEqual([["en", "en-US", "en-US"], ["de", "de-DE", "de-DE"]]);
    });

    it("uses only licensed font files from its fonts folder", () => {
      expect(fs.readFileSync(path.join(root, "shotsmith.config.json"), "utf8")).not.toContain("sysfont:");
      const files = fs.readdirSync(path.join(root, "fonts"));
      expect(files.some((f) => /OFL|LICENSE/i.test(f))).toBe(true);
      expect(files.filter((f) => /^(\.?SF|New ?York)/i.test(f))).toEqual([]);
    });

    it("has a source and both locales for every claim", () => {
      expect(validateClaims(loadClaims(root), ["en", "de"])).toEqual([]);
    });

    it("has captures for every platform and locale", () => {
      expect(checkInputs(loadConfig(root))).toEqual([]);
      for (const p of ["iphone", "android-phone"]) for (const l of ["en", "de"]) {
        expect(fs.readdirSync(path.join(root, "inputs", p, l)).filter((f) => f.endsWith(".png")).length, `${p}/${l}`).toBe(3);
      }
    });

    it("keeps generated folders out of git", () => {
      for (const d of ["out", "review", "export", "node_modules"]) expect(ignored(`examples/${app}/${d}/x`), d).toBe(true);
    });
  });
});
