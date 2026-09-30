import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkClaims } from "../src/checks/claims.js";
import { loadConfig } from "../src/config/schema.js";
import type { Sidecar, SidecarClaimShown, SidecarGenerated, SidecarText } from "../src/shared/sidecar.js";
import { tempDir } from "./helpers.js";

const text = (claim: string | null, chrome = false, shown = "x"): SidecarText => ({ el: 0, claim, chrome, text: shown, box: [0, 0, 1, 1], font: "", overflow: false, clipped: false, safeArea: false, shrink: null, covered: true, fallbackFonts: [] });
const sidecar = (locale: string, o: Partial<Sidecar> = {}): Sidecar => ({ page: "a", target: "iphone-6.9", locale, kit: true, texts: [], fonts: [], captures: [], devices: [], lifts: 0, warnings: [], requests: { captures: [], fonts: [] }, changedAfterReady: false, generated: [], claimsShown: [], servedFonts: [], ...o });
const shown = (claim: string, t: string): SidecarClaimShown => ({ claim, text: t, box: [0, 0, 1, 1] });
const gen = (kind: SidecarGenerated["kind"], t: string, chrome = false): SidecarGenerated => ({ kind, text: t, box: [0, 0, 1, 1], chrome });

function config(locales: string[]) {
  const dir = tempDir("cc-");
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a"], targets: ["iphone-6.9"], locales: locales.map((code) => ({ code })) }));
  return loadConfig(dir);
}

describe("checkClaims", () => {
  it("reports untraced, unknown and unused claims", () => {
    const cfg = config(["en"]);
    const claims = { used: { source: "s", text: { en: "x" } }, spare: { source: "s", text: { en: "y" } } };
    const f = checkClaims(cfg, claims, [sidecar("en", { texts: [text("used"), text(null), text(null, true), text("ghost")], claimsShown: [shown("used", "x"), shown("ghost", "x")] })]);
    expect(f.map((x) => `${x.severity}:${x.rule}`).sort()).toEqual(["error:claims.unknown", "error:claims.untraced", "warning:claims.unused"]);
  });

  it("requires each claim element to show exactly the claim's text for the locale, ignoring whitespace", () => {
    const cfg = config(["en", "de"]);
    const claims = { h: { source: "s", text: { en: "Fresh  ideas\nfor your table.", de: "Frische Ideen" } } };
    const ok = checkClaims(cfg, claims, [sidecar("en", { claimsShown: [shown("h", "Fresh ideas for your table.")] }), sidecar("de", { claimsShown: [shown("h", "Frische  Ideen")] })]);
    expect(ok.filter((x) => x.rule === "claims.mismatch")).toEqual([]);
    const bad = checkClaims(cfg, claims, [
      sidecar("en", { claimsShown: [shown("h", "Fresh ideas")] }),
      sidecar("en", { claimsShown: [shown("h", "for your table. Fresh ideas")] }),
      sidecar("de", { claimsShown: [shown("h", "Fresh ideas for your table.")] }),
    ]);
    expect(bad.filter((x) => x.rule === "claims.mismatch").map((x) => `${x.severity}:${x.locale}`)).toEqual(["error:en", "error:en", "error:de"]);
    expect(bad[0].message).toMatch(/shows "Fresh ideas" but its en text is "Fresh {2}ideas\nfor your table\."/);
  });

  it("reports every generated text that is not chrome, with its kind", () => {
    const cfg = config(["en"]);
    const kinds: SidecarGenerated["kind"][] = ["pseudo", "marker", "canvas", "frame", "form", "svgImage", "shadowClosed", "alt"];
    const f = checkClaims(cfg, {}, [sidecar("en", { generated: [...kinds.map((k) => gen(k, "Free forever")), gen("canvas", "9:41", true)] })]);
    expect(f.map((x) => x.rule)).toEqual(kinds.map(() => "claims.untraced"));
    kinds.forEach((k, i) => expect(f[i].message).toMatch(new RegExp(`^${k}: "Free forever"`)));
  });

  it("ignores punctuation-only pseudo content but not numbered list markers", () => {
    const cfg = config(["en"]);
    const f = checkClaims(cfg, {}, [sidecar("en", { generated: [gen("pseudo", '"'), gen("pseudo", "“ ”"), gen("pseudo", "•"), gen("marker", "decimal"), gen("pseudo", 'counter(step) ". "')] })]);
    expect(f.map((x) => x.rule)).toEqual(["claims.untraced", "claims.untraced"]);
    for (const x of f) expect(x.message).toMatch(/numbered lists must put their numbers in claim text/);
  });
});
