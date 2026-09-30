import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkClaims } from "../src/checks/claims.js";
import { loadConfig } from "../src/config/schema.js";
import type { Sidecar, SidecarText } from "../src/shared/sidecar.js";
import { tempDir } from "./helpers.js";

const text = (claim: string | null, chrome = false, shown = "x"): SidecarText => ({ el: 0, claim, chrome, text: shown, box: [0, 0, 1, 1], font: "", overflow: false, clipped: false, safeArea: false, shrink: null, covered: true, fallbackFonts: [] });

describe("checkClaims", () => {
  it("reports untraced, unknown and unused claims", () => {
    const dir = tempDir("cc-");
    fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a"], targets: ["iphone-6.9"], locales: [{ code: "en" }] }));
    const cfg = loadConfig(dir);
    const claims = { used: { source: "s", text: { en: "x" } }, spare: { source: "s", text: { en: "y" } } };
    const sc: Sidecar = { page: "a", target: "iphone-6.9", locale: "en", kit: true, texts: [text("used"), text(null), text(null, true), text("ghost")], fonts: [], captures: [], devices: [], lifts: 0, warnings: [] };
    const f = checkClaims(cfg, claims, [sc]);
    expect(f.map((x) => `${x.severity}:${x.rule}`).sort()).toEqual(["error:claims.unknown", "error:claims.untraced", "warning:claims.unused"]);
  });

  it("requires traced text to be part of the claim's text for the locale", () => {
    const dir = tempDir("cc-");
    fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a"], targets: ["iphone-6.9"], locales: [{ code: "en" }, { code: "de" }] }));
    const cfg = loadConfig(dir);
    const claims = { h: { source: "s", text: { en: "Fresh  ideas\nfor your table.", de: "Frische Ideen" } } };
    const sc = (locale: string, texts: SidecarText[]): Sidecar => ({ page: "a", target: "iphone-6.9", locale, kit: true, texts, fonts: [], captures: [], devices: [], lifts: 0, warnings: [] });
    const ok = checkClaims(cfg, claims, [sc("en", [text("h", false, "Fresh ideas for"), text("h", false, "your table.")]), sc("de", [text("h", false, "Frische Ideen")])]);
    expect(ok.filter((x) => x.rule === "claims.mismatch")).toEqual([]);
    const bad = checkClaims(cfg, claims, [sc("en", [text("h", false, "Rated #1")]), sc("de", [text("h", false, "Fresh ideas")])]);
    expect(bad.filter((x) => x.rule === "claims.mismatch").map((x) => `${x.severity}:${x.locale}`)).toEqual(["error:en", "error:de"]);
  });
});
