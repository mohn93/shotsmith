import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkClaims } from "../src/checks/claims.js";
import { loadConfig } from "../src/config/schema.js";
import type { Sidecar, SidecarClaimShown, SidecarGenerated, SidecarText } from "../src/shared/sidecar.js";
import { tempDir } from "./helpers.js";

const text = (claim: string | null, shown = "x"): SidecarText => ({ el: 0, claim, text: shown, box: [0, 0, 1, 1], font: "", overflow: false, clipped: false, safeArea: false, shrink: null, covered: true, fallbackFonts: [] });
const sidecar = (locale: string, o: Partial<Sidecar> = {}): Sidecar => ({ page: "a", target: "iphone-6.9", locale, kit: true, texts: [], fonts: [], captures: [], devices: [], lifts: 0, warnings: [], requests: { captures: [], fonts: [] }, changedAfterReady: false, generated: [], claimsShown: [], servedFonts: [], ...o });
const shown = (claim: string, t: string): SidecarClaimShown => ({ claim, text: t, box: [0, 0, 1, 1] });
const gen = (kind: SidecarGenerated["kind"], t: string): SidecarGenerated => ({ kind, text: t, box: [0, 0, 1, 1] });

function config(locales: string[]) {
  const dir = tempDir("cc-");
  fs.writeFileSync(path.join(dir, "shotsmith.config.json"), JSON.stringify({ app: "A", pages: ["a"], targets: ["iphone-6.9"], locales: locales.map((code) => ({ code })) }));
  return loadConfig(dir);
}

describe("checkClaims", () => {
  it("reports untraced, unknown and unused claims", () => {
    const cfg = config(["en"]);
    const claims = { used: { source: "s", text: { en: "x" } }, spare: { source: "s", text: { en: "y" } } };
    const f = checkClaims(cfg, claims, [sidecar("en", { texts: [text("used"), text(null), text("ghost")], claimsShown: [shown("used", "x"), shown("ghost", "x")] })]);
    expect(f.map((x) => `${x.severity}:${x.rule}`).sort()).toEqual(["error:claims.unknown", "error:claims.untraced", "warning:claims.unused"]);
    expect(f.find((x) => x.rule === "claims.untraced")!.message).toBe('"x" is visible text outside a claim element; put it inside a claim element (t.el(), headline() or an element with data-claim)');
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
    expect(bad[0].message).toBe('claim "h" shows "Fresh ideas" but its en text is "Fresh ideas for your table."');
  });

  it("shows where long texts first differ, on one line", () => {
    const cfg = config(["en"]);
    const long = "Plan every meal of the week in minutes,\nthen shop for all of it with one list that sorts itself by aisle.";
    const f = checkClaims(cfg, { h: { source: "s", text: { en: long } } }, [sidecar("en", { claimsShown: [shown("h", long.replace("one list", "two lists"))] })]);
    expect(f.map((x) => x.rule)).toEqual(["claims.mismatch"]);
    expect(f[0].message).not.toMatch(/\n/);
    expect(f[0].message).toMatch(/shows "\.\.\.[^"]*with two lists[^"]*" but its en text is "\.\.\.[^"]*with one list[^"]*" \(they differ from character \d+\)/);
  });

  it("reports every generated text with its kind", () => {
    const cfg = config(["en"]);
    const kinds: SidecarGenerated["kind"][] = ["pseudo", "marker", "canvas", "frame", "form", "svgImage", "shadowClosed", "alt"];
    const f = checkClaims(cfg, {}, [sidecar("en", { generated: kinds.map((k) => gen(k, "Free forever")) })]);
    expect(f.map((x) => x.rule)).toEqual(kinds.map(() => "claims.untraced"));
    kinds.forEach((k, i) => expect(f[i].message).toMatch(new RegExp(`^${k}: "Free forever"`)));
  });

  it("says an unreadable SVG image could not be checked, not that its URL is drawn text", () => {
    const cfg = config(["en"]);
    const f = checkClaims(cfg, {}, [sidecar("en", { generated: [gen("svgUnreadable", "https://cdn.example.com/bg.svg")] })]);
    expect(f.map((x) => x.rule)).toEqual(["claims.untraced"]);
    expect(f[0].message).toMatch(/^could not read SVG image "https:\/\/cdn\.example\.com\/bg\.svg" to check it for text; /);
  });

  it("ignores punctuation and symbol decoration in pseudo content and markers, but not counters or words", () => {
    const cfg = config(["en"]);
    const decoration = [gen("pseudo", '"'), gen("pseudo", "\u201c \u201d"), gen("pseudo", "\u2022"), gen("pseudo", "\u2713"), gen("marker", "\u2022"), gen("marker", "\u2605"), gen("marker", "\u2192")];
    const f = checkClaims(cfg, {}, [sidecar("en", { generated: [...decoration, gen("marker", "decimal"), gen("pseudo", 'counter(step) ". "'), gen("marker", "Free forever")] })]);
    expect(f.map((x) => x.rule)).toEqual(["claims.untraced", "claims.untraced", "claims.untraced"]);
    const hint = /numbered lists must put their numbers in claim text/;
    expect(f.map((x) => hint.test(x.message))).toEqual([true, true, false]);
  });
});
