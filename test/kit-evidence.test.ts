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

  it("marks text inside an ellipsis container that overflows", async () => {
    const s = await render("ellipsis");
    expect(s.texts.find((x) => x.text.startsWith("Free forever"))).toMatchObject({ overflow: true, claim: null });
  });
});
