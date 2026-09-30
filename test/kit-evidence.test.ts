import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/schema.js";
import { type Renderer, openRenderer, outPath, renderPage } from "../src/render/render.js";
import type { Sidecar } from "../src/shared/sidecar.js";
import { makeCaptures } from "./captures.js";
import { tmpWorkspace } from "./helpers.js";

// Every evidence page shows "Free forever" through one route beside the traced "headline" claim.
let r: Renderer;
beforeAll(async () => {
  const ws = tmpWorkspace("kit");
  await makeCaptures(ws);
  r = await openRenderer(loadConfig(ws));
});
afterAll(async () => { await r?.close(); });

const render = async (name: string, target = "iphone-6.9"): Promise<Sidecar> => {
  const page = `evidence-${name}`;
  return (await renderPage(r, { page, target, locale: "en", out: outPath(r.cfg, "en", target, page) })).sidecar;
};
const HEADLINE = "Fresh ideas for your table.";
const free = (s: Sidecar) => s.generated.filter((g) => g.text === "Free forever");

describe("kit evidence: generated text", () => {
  for (const [page, kind] of [["after", "pseudo"], ["attr", "pseudo"], ["marker", "marker"], ["canvas", "canvas"], ["offscreen", "canvas"],
    ["input", "form"], ["textarea", "form"], ["svg-bg", "svgImage"]] as const) {
    it(`records ${page} as ${kind}`, async () => {
      const s = await render(page);
      expect(free(s)).toEqual([expect.objectContaining({ kind, chrome: false })]);
      expect(s.claimsShown).toContainEqual(expect.objectContaining({ claim: "headline", text: HEADLINE }));
    });
  }

  it("records a DOM canvas at its box", async () => {
    const [g] = free(await render("canvas"));
    expect(g.box[2]).toBeGreaterThan(0);
    expect(g.box[3]).toBeGreaterThan(0);
  });

  it("records an iframe as a frame", async () => {
    const s = await render("iframe");
    const frames = s.generated.filter((g) => g.kind === "frame");
    expect(frames).toHaveLength(1);
    expect(frames[0].text).toMatch(/^iframe/);
    expect(frames[0].box[2]).toBeGreaterThan(0);
  });

  it("traces text in an open shadow root like page text", async () => {
    const s = await render("shadow-open");
    expect(s.texts).toContainEqual(expect.objectContaining({ text: "Free forever", claim: null, chrome: false }));
    expect(s.generated).toEqual([]);
  });

  it("forces a closed shadow root created after the kit loads open and traces it", async () => {
    const s = await render("shadow-closed");
    expect(s.texts).toContainEqual(expect.objectContaining({ text: "Free forever", claim: null }));
    expect(s.generated).toEqual([]);
  });

  it("records a closed shadow root that existed before the kit loaded", async () => {
    const s = await render("shadow-early");
    expect(s.generated).toEqual([expect.objectContaining({ kind: "shadowClosed", chrome: false })]);
    expect(s.generated[0].text).toMatch(/div#early/);
  });

  it("records canvas text drawn by a classic script before the kit loads", async () => {
    const s = await render("classic-canvas");
    expect(free(s)).toEqual([expect.objectContaining({ kind: "canvas", chrome: false })]);
    expect(free(s)[0].box[2]).toBeGreaterThan(0);
  });

  it("opens a closed shadow root made by a classic script before the kit loads", async () => {
    const s = await render("classic-closed");
    expect(s.texts).toContainEqual(expect.objectContaining({ text: "Free forever", claim: null }));
    expect(s.generated).toEqual([]);
  });

  it("does not report the light children of an open host without a slot", async () => {
    const s = await render("slotless");
    expect(s.texts.map((x) => x.text)).toEqual([HEADLINE, "Free forever"]);
    expect(s.generated).toEqual([]);
  });

  it("records alt text shown in place of an image", async () => {
    const s = await render("alt");
    expect(s.generated.filter((g) => g.kind === "alt").map((g) => g.text).sort()).toEqual(["Also shown", "Free forever"]);
  });

  it("records no alt text for images drawn from srcset or <picture>", async () => {
    const s = await render("alt-srcset");
    expect(s.generated.filter((g) => g.kind === "alt").map((g) => g.text)).toEqual(["Free forever"]);
  });

  it("adds nothing for the device status bar and lift crops", async () => {
    for (const target of ["iphone-6.9", "android-phone"]) {
      const s = await render("device", target);
      expect(s.devices).toHaveLength(1);
      expect(s.lifts).toBe(1);
      expect(s.generated).toEqual([]);
    }
  });
});

describe("kit evidence: visibility and clipping", () => {
  it("counts visible text inside a visibility:hidden parent", async () => {
    const s = await render("hidden-parent");
    expect(s.texts.map((x) => x.text)).toContain("Free forever");
    expect(s.texts.map((x) => x.text)).not.toContain("Secret");
  });

  it("leaves transparent text out of claimsShown", async () => {
    const s = await render("transparent");
    expect(s.claimsShown).toEqual([expect.objectContaining({ claim: "headline", text: HEADLINE })]);
    expect(s.texts.map((x) => x.text)).not.toContain("Free forever");
  });

  it("marks claim text cut by a 50 px overflow:hidden parent as clipped", async () => {
    const s = await render("clip");
    const cut = s.texts.filter((x) => x.claim === "headline" && x.box[1] > 800);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((x) => x.clipped)).toBe(true);
    expect(s.texts.find((x) => x.claim === "headline" && x.box[1] < 800)).toMatchObject({ clipped: false, overflow: false });
  });

  it("marks an inline claim cut by a nowrap overflow:hidden parent as clipped and overflowing", async () => {
    const s = await render("inline-clip");
    const cut = s.texts.find((x) => x.claim === "headline" && x.box[1] > 800);
    expect(cut).toMatchObject({ clipped: true, overflow: true });
  });

  it("marks text under a clip-path it cannot evaluate as clipped", async () => {
    const s = await render("clip-calc");
    const cut = s.texts.filter((x) => x.claim === "headline" && x.box[1] > 800);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((x) => x.clipped)).toBe(true);
  });

  it("judges SVG text by its fill and stroke, not color", async () => {
    const s = await render("svg-fill");
    expect(s.texts.map((x) => x.text)).toContain("Free forever");
    expect(s.texts.map((x) => x.text)).not.toContain("Unpainted");
  });

  it("reports only visible claim elements in claimsShown", async () => {
    const s = await render("hidden-claim");
    expect(s.claimsShown).toEqual([expect.objectContaining({ claim: "headline", text: HEADLINE })]);
  });

  it("collects evidence on a 10,000-block page in under 3 s", async () => {
    const tab = await r.browser.newPage({ viewport: { width: 1290, height: 2796 } });
    try {
      await tab.goto(`${r.server.url}/pages/evidence-big.html?t=iphone-6.9&l=en`);
      await tab.waitForFunction(() => (window as any).__readyMs !== undefined || (window as any).__shotsmithError, null, { timeout: 60000 });
      const [ms, error, texts] = await tab.evaluate(() => [(window as any).__readyMs, (window as any).__shotsmithError, (window as any).__shotsmithSidecar?.texts.length]);
      expect(error).toBeUndefined();
      expect(texts).toBe(10001);
      console.log(`ready() on 10,000 blocks: ${Math.round(ms)} ms`);
      expect(ms).toBeLessThan(3000);
    } finally { await tab.close(); }
  });

  it("evaluates circle(50%) clips: centred text fits, text in the corner is cut", async () => {
    const s = await render("circle");
    expect(s.texts.find((x) => x.text === "Free forever")).toMatchObject({ clipped: false });
    expect(s.texts.find((x) => x.text === "Corner words")).toMatchObject({ clipped: true });
  });

  it("reports a hidden claim element whose visible child shows its text", async () => {
    const s = await render("hidden-claim-child");
    const long = s.texts.find((x) => x.claim === "long")!;
    expect(long).toBeDefined();
    expect(s.claimsShown).toContainEqual(expect.objectContaining({ claim: "long", text: long.text }));
  });

  it("traces a display:contents claim element", async () => {
    const s = await render("contents-claim");
    const long = s.texts.find((x) => x.claim === "long")!;
    expect(long).toBeDefined();
    const shown = s.claimsShown.find((x) => x.claim === "long")!;
    expect(shown.text).toBe(long.text);
    expect(shown.box[2]).toBeGreaterThan(0);
  });

  it("marks text inside an ellipsis container that overflows", async () => {
    const s = await render("ellipsis");
    expect(s.texts.find((x) => x.text.startsWith("Free forever"))).toMatchObject({ overflow: true, claim: null });
  });
});
