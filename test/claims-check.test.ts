import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkClaims } from "../src/checks/claims.js";
import { loadConfig } from "../src/config/schema.js";
import type { Sidecar, SidecarText } from "../src/shared/sidecar.js";

const text = (claim: string | null, chrome = false): SidecarText => ({ el: 0, claim, chrome, text: "x", box: [0, 0, 1, 1], font: "", overflow: false, clipped: false, safeArea: false, shrink: null, covered: true, fallbackFonts: [] });

describe("checkClaims", () => {
  it("reports untraced, unknown and unused claims", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-"));
    fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a"], targets: ["iphone-6.9"], locales: [{ code: "en" }] }));
    const cfg = loadConfig(dir);
    const claims = { used: { source: "s", text: { en: "x" } }, spare: { source: "s", text: { en: "y" } } };
    const sc: Sidecar = { page: "a", target: "iphone-6.9", locale: "en", kit: true, texts: [text("used"), text(null), text(null, true), text("ghost")], fonts: [], captures: [], devices: [], lifts: 0, warnings: [] };
    const f = checkClaims(cfg, claims, [sc]);
    expect(f.map((x) => `${x.severity}:${x.rule}`).sort()).toEqual(["error:claims.unknown", "error:claims.untraced", "warning:claims.unused"]);
  });
});
