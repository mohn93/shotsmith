import { execFileSync } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makeCaptures } from "./captures.js";
import { ROOT, tempDir, tmpWorkspace } from "./helpers.js";

function prepare(): string {
  const ws = tmpWorkspace("kit");
  const cfg = JSON.parse(fs.readFileSync(`${ws}/shotsmith.config.json`, "utf8"));
  cfg.pages = ["screen"];
  cfg.targets = ["iphone-6.9", "android-phone"];
  cfg.locales = [{ code: "en" }, { code: "de" }];
  fs.writeFileSync(`${ws}/shotsmith.config.json`, JSON.stringify(cfg));
  const claims = JSON.parse(fs.readFileSync(`${ws}/claims.json`, "utf8"));
  delete claims.long;
  for (const c of Object.values<any>(claims)) delete c.text.ar;
  fs.writeFileSync(`${ws}/claims.json`, JSON.stringify(claims));
  return ws;
}
const cli = (ws: string, ...args: string[]) => {
  try { return { code: 0, out: execFileSync("node", [`${ROOT}/dist/cli.js`, ...args, "-C", ws, "--json"], { encoding: "utf8" }) }; }
  catch (e: any) { return { code: e.status as number, out: String(e.stdout) }; }
};

const cliErr = (ws: string, ...args: string[]) => {
  try { execFileSync("node", [`${ROOT}/dist/cli.js`, ...args, "-C", ws, "--json"], { encoding: "utf8", stdio: "pipe" }); return { code: 0, err: "" }; }
  catch (e: any) { return { code: e.status as number, err: String(JSON.parse(String(e.stdout)).error.message) }; }
};

async function allCaptures(ws: string): Promise<void> {
  await makeCaptures(ws);
  fs.mkdirSync(`${ws}/inputs/iphone/de`, { recursive: true });
  fs.copyFileSync(`${ws}/inputs/iphone/en/home.png`, `${ws}/inputs/iphone/de/home.png`);
  fs.mkdirSync(`${ws}/inputs/android-phone/de`, { recursive: true });
  fs.copyFileSync(`${ws}/inputs/android-phone/en/home.png`, `${ws}/inputs/android-phone/de/home.png`);
}

describe("build", () => {
  it("renders the matrix, exports store-ready JPEGs and passes the checks", async () => {
    const ws = prepare();
    await allCaptures(ws);
    fs.mkdirSync(`${ws}/export/en/iphone-6.9`, { recursive: true });
    fs.writeFileSync(`${ws}/export/en/iphone-6.9/stale.jpg`, "x");
    const { code, out } = cli(ws, "build");
    const res = JSON.parse(out);
    expect(res.errors).toEqual([]);
    expect(code).toBe(0);
    for (const l of ["en", "de"]) for (const t of ["iphone-6.9", "android-phone"]) {
      const m = await sharp(`${ws}/export/${l}/${t}/screen.jpg`).metadata();
      expect(m).toMatchObject({ format: "jpeg", isProgressive: false, chromaSubsampling: "4:4:4", channels: 3 });
      expect(fs.existsSync(`${ws}/export/contact-sheets/${l}-${t}.jpg`)).toBe(true);
    }
    expect(fs.existsSync(`${ws}/export/en/iphone-6.9/stale.jpg`)).toBe(false);
    expect(fs.readFileSync(`${ws}/export/REPORT.md`, "utf8")).toMatch(/No errors/);
  });

  it("removes the outputs of a page that stops rendering, so check fails", async () => {
    const ws = prepare();
    await allCaptures(ws);
    expect(cli(ws, "build", "-l", "en", "-t", "iphone-6.9").code).toBe(0);
    expect(fs.existsSync(`${ws}/export/en/iphone-6.9/screen.jpg`)).toBe(true);
    fs.writeFileSync(`${ws}/pages/screen.html`, `<!doctype html><body><script type="module">
      import { stage } from "shotsmith/kit";
      await stage();
      throw new Error("broken on purpose");</script></body></html>`);
    const b = cli(ws, "build", "-l", "en", "-t", "iphone-6.9");
    expect(b.code).toBe(1);
    expect(JSON.parse(b.out).errors.map((e: any) => e.rule)).toContain("render.failed");
    for (const f of ["out/en/iphone-6.9/screen.png", "out/en/iphone-6.9/screen.sidecar.json", "export/en/iphone-6.9/screen.jpg", "export/contact-sheets/en-iphone-6.9.jpg"]) {
      expect(fs.existsSync(`${ws}/${f}`), f).toBe(false);
    }
    const c = cli(ws, "check");
    expect(c.code).toBe(1);
    const rules = JSON.parse(c.out).errors.filter((e: any) => e.locale === "en" && e.target === "iphone-6.9").map((e: any) => e.rule);
    expect(rules).toEqual(expect.arrayContaining(["render.missing", "store.missing"]));
  });

  it("fails pages that do not use the kit, while render still writes them", () => {
    const ws = tmpWorkspace("basic");
    expect(cli(ws, "render", "plain", "-t", "android-phone").code).toBe(0);
    const b = cli(ws, "build", "-t", "android-phone");
    expect(b.code).toBe(1);
    expect(JSON.parse(b.out).errors).toContainEqual(expect.objectContaining({ rule: "kit.unused", severity: "error", page: "plain" }));
  });

  it("fails and reports untraced text", async () => {
    const ws = prepare();
    await makeCaptures(ws);
    fs.writeFileSync(`${ws}/pages/screen.html`, fs.readFileSync(`${ws}/pages/screen.html`, "utf8").replace("await ready();", 'const x = document.createElement("div"); x.textContent = "Rated #1"; x.style.cssText = "position:absolute;left:90px;top:1500px;color:#fff"; s.root.appendChild(x); await ready();'));
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "iphone-6.9");
    expect(code).toBe(1);
    expect(JSON.parse(out).errors.some((e: any) => e.rule === "claims.untraced")).toBe(true);
    expect(fs.readFileSync(`${ws}/export/REPORT.md`, "utf8")).toMatch(/claims\.untraced/);
  });

  // Every file under dir with its contents, to show a build left it alone.
  const snapshot = (dir: string) => Object.fromEntries((fs.readdirSync(dir, { recursive: true }) as string[]).sort()
    .map((f) => [f, fs.statSync(`${dir}/${f}`).isFile() ? fs.readFileSync(`${dir}/${f}`, "utf8") : "(dir)"]));

  it("refuses a linked output folder and touches nothing outside the workspace", async () => {
    const ws = prepare();
    await allCaptures(ws);
    const outside = tempDir("outside-export-");
    fs.mkdirSync(`${outside}/en/android-phone`, { recursive: true });
    fs.writeFileSync(`${outside}/en/android-phone/screen.jpg`, "old");
    fs.writeFileSync(`${outside}/keep.png`, "keep");
    const before = snapshot(outside);
    fs.symlinkSync(outside, `${ws}/export`, "dir");
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "android-phone");
    expect(code).toBe(1);
    const res = JSON.parse(out);
    expect(res.errors).toContainEqual(expect.objectContaining({ rule: "store.linked", message: expect.stringMatching(/^export is a link.*real folder inside the workspace/) }));
    expect(res.report).toBe("");
    expect(snapshot(outside)).toEqual(before);
  });

  it("refuses a linked target folder and leaves the files it points at alone", async () => {
    const ws = prepare();
    await allCaptures(ws);
    const outside = tempDir("outside-target-");
    fs.writeFileSync(`${outside}/screen.jpg`, "old");
    fs.writeFileSync(`${outside}/stale.png`, "keep");
    const before = snapshot(outside);
    fs.mkdirSync(`${ws}/export/en`, { recursive: true });
    fs.symlinkSync(outside, `${ws}/export/en/android-phone`, "dir");
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "android-phone");
    expect(code).toBe(1);
    expect(JSON.parse(out).errors).toContainEqual(expect.objectContaining({ rule: "store.linked", locale: "en", message: expect.stringMatching(/^export\/en\/android-phone is a link/) }));
    expect(snapshot(outside)).toEqual(before);
    expect(fs.existsSync(`${ws}/export/REPORT.md`)).toBe(true);
  });

  it("does not write the report through a linked REPORT.md", async () => {
    const ws = prepare();
    await allCaptures(ws);
    const outside = tempDir("outside-report-");
    fs.writeFileSync(`${outside}/notes.md`, "keep");
    fs.mkdirSync(`${ws}/export`, { recursive: true });
    fs.symlinkSync(`${outside}/notes.md`, `${ws}/export/REPORT.md`);
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "android-phone");
    expect(code).toBe(1);
    const res = JSON.parse(out);
    expect(res.errors).toContainEqual(expect.objectContaining({ rule: "store.linked", message: expect.stringMatching(/^export\/REPORT\.md is a link/) }));
    expect(res.report).toBe("");
    expect(fs.readFileSync(`${outside}/notes.md`, "utf8")).toBe("keep");
    expect(fs.lstatSync(`${ws}/export/REPORT.md`).isSymbolicLink()).toBe(true);
  });

  it("removes a removed locale's folder that holds only .DS_Store files", async () => {
    const ws = prepare();
    await allCaptures(ws);
    for (const d of ["fr", "fr/android-phone"]) {
      fs.mkdirSync(`${ws}/export/${d}`, { recursive: true });
      fs.writeFileSync(`${ws}/export/${d}/.DS_Store`, "finder");
    }
    fs.writeFileSync(`${ws}/export/fr/android-phone/screen.jpg`, "x");
    fs.mkdirSync(`${ws}/export/it`, { recursive: true });
    fs.writeFileSync(`${ws}/export/it/.DS_Store`, "finder");
    fs.writeFileSync(`${ws}/export/it/notes.txt`, "keep");
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "android-phone");
    const res = JSON.parse(out);
    expect(res.errors.map((e: any) => `${e.rule} ${e.message.split(" ")[0]}`)).toEqual(["store.stale export/it/"]);
    expect(code).toBe(1);
    expect(fs.existsSync(`${ws}/export/fr`)).toBe(false);
    expect(fs.readdirSync(`${ws}/export/it`).sort()).toEqual([".DS_Store", "notes.txt"]);
  });

  it("rejects unknown targets and locales and invalid --jobs", () => {
    const ws = prepare();
    const t = cliErr(ws, "build", "-t", "iphone-69");
    expect(t.code).toBe(2);
    expect(t.err).toMatch(/Unknown target\(s\): iphone-69/);
    const l = cliErr(ws, "build", "-l", "fr");
    expect(l.code).toBe(2);
    expect(l.err).toMatch(/Unknown locale\(s\): fr/);
    const j = cliErr(ws, "build", "--jobs", "abc");
    expect(j.code).toBe(2);
    expect(j.err).toMatch(/--jobs must be/);
    expect(cliErr(ws, "build", "--jobs", "0").code).toBe(2);
    expect(fs.existsSync(`${ws}/export`)).toBe(false);
  });

  it("does not require captures for platforms that are not being built", async () => {
    const ws = prepare();
    await makeCaptures(ws);
    fs.rmSync(`${ws}/inputs/android-phone`, { recursive: true });
    fs.mkdirSync(`${ws}/inputs/iphone/de`, { recursive: true });
    fs.copyFileSync(`${ws}/inputs/iphone/en/home.png`, `${ws}/inputs/iphone/de/home.png`);
    const { code, out } = cli(ws, "build", "-t", "iphone-6.9");
    const res = JSON.parse(out);
    expect(res.errors.filter((e: any) => e.rule === "capture.platform")).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(code).toBe(0);
  });
});
