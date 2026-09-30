// What the canvas patches record, per canvas: text drawn with fillText/strokeText, and image URLs drawn into it.
export interface PatchState {
  canvasTexts: Map<object, Set<string>>;
  canvasImages: Map<object, Set<string>>;
  // Canvases the kit is drawing on right now (status bars, lift crops): not recorded.
  internal: WeakSet<object>;
}

declare global {
  interface Window { __shotsmithPatches?: PatchState }
}

// Records text drawn into canvases and forces every shadow root open. The renderer installs it as an init script, so
// it runs before any page script and in every frame; the kit calls it too (for pages opened another way) and it
// installs only once. Self-contained: it is serialized into the page.
export function installPatches(): void {
  if (window.__shotsmithPatches) return;
  const state: PatchState = { canvasTexts: new Map(), canvasImages: new Map(), internal: new WeakSet() };
  window.__shotsmithPatches = state;
  const note = (m: Map<object, Set<string>>, canvas: object, v: string) => {
    const set = m.get(canvas) ?? new Set<string>();
    set.add(v);
    m.set(canvas, set);
  };
  // Text drawn once ready() starts collecting evidence (__shotsmithSealed) is never checked: make the renderer's
  // after-ready comparison fail.
  const drawnAfterReady = () => { if ((window as { __shotsmithSealed?: boolean }).__shotsmithSealed) (window as { __shotsmithDomHash?: string }).__shotsmithDomHash = "canvas-text-after-ready"; };
  const imageUrl = (src: unknown): string | null => {
    if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return src.currentSrc || src.src || null;
    if (typeof SVGImageElement !== "undefined" && src instanceof SVGImageElement) return src.href.baseVal ? new URL(src.href.baseVal, document.baseURI).href : null;
    return null;
  };
  type Method = (this: { canvas: object }, ...a: unknown[]) => unknown;
  const patch = (ctor: string, texts: string[], images: string[]) => {
    const proto = (window as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>)[ctor]?.prototype;
    if (!proto) return;
    for (const name of [...texts, ...images]) {
      const orig = proto[name] as Method | undefined;
      if (typeof orig !== "function") continue;
      const text = texts.includes(name);
      proto[name] = function (this: { canvas: object }, ...a: unknown[]) {
        if (!state.internal.has(this.canvas)) {
          if (text) { note(state.canvasTexts, this.canvas, String(a[0])); drawnAfterReady(); }
          else for (const x of a) { const url = imageUrl(x); if (url) note(state.canvasImages, this.canvas, url); }
        }
        return orig.apply(this, a);
      };
    }
  };
  for (const ctor of ["CanvasRenderingContext2D", "OffscreenCanvasRenderingContext2D"]) patch(ctor, ["fillText", "strokeText"], ["drawImage", "createPattern"]);
  for (const ctor of ["WebGLRenderingContext", "WebGL2RenderingContext"]) patch(ctor, [], ["texImage2D", "texSubImage2D"]);

  // A canvas handed to a worker is drawn where the patches cannot see.
  if (typeof HTMLCanvasElement !== "undefined" && HTMLCanvasElement.prototype.transferControlToOffscreen) {
    const transfer = HTMLCanvasElement.prototype.transferControlToOffscreen;
    HTMLCanvasElement.prototype.transferControlToOffscreen = function (this: HTMLCanvasElement) {
      note(state.canvasTexts, this, "(canvas drawn off the main thread)");
      return transfer.call(this);
    };
  }

  // Every shadow root the page makes is open, so ready() can read it. Closed roots from markup are found by the renderer.
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
    return attachShadow.call(this, { ...init, mode: "open" });
  };
}
