import { execFileSync } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makeCaptures } from "./captures.js";
import { ROOT, tmpWorkspace } from "./helpers.js";

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
  catch (e: any) { return { code: e.status as number, err: String(e.stderr) }; }
};

describe("build", () => {
  it("renders the matrix, exports store-ready JPEGs and passes the checks", async () => {
    const ws = prepare();
    await makeCaptures(ws);
    fs.mkdirSync(`${ws}/inputs/iphone/de`, { recursive: true });
    fs.copyFileSync(`${ws}/inputs/iphone/en/home.png`, `${ws}/inputs/iphone/de/home.png`);
    fs.mkdirSync(`${ws}/inputs/android-phone/de`, { recursive: true });
    fs.copyFileSync(`${ws}/inputs/android-phone/en/home.png`, `${ws}/inputs/android-phone/de/home.png`);
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

  it("fails and reports untraced text", async () => {
    const ws = prepare();
    await makeCaptures(ws);
    fs.writeFileSync(`${ws}/pages/screen.html`, fs.readFileSync(`${ws}/pages/screen.html`, "utf8").replace("await ready();", 'const x = document.createElement("div"); x.textContent = "Rated #1"; x.style.cssText = "position:absolute;left:90px;top:1500px;color:#fff"; s.root.appendChild(x); await ready();'));
    const { code, out } = cli(ws, "build", "-l", "en", "-t", "iphone-6.9");
    expect(code).toBe(1);
    expect(JSON.parse(out).errors.some((e: any) => e.rule === "claims.untraced")).toBe(true);
    expect(fs.readFileSync(`${ws}/export/REPORT.md`, "utf8")).toMatch(/claims\.untraced/);
  });

  it("rejects unknown targets and locales and invalid --jobs", () => {
    const ws = prepare();
    const t = cliErr(ws, "build", "-t", "iphone-69");
    expect(t.code).not.toBe(0);
    expect(t.err).toMatch(/Unknown target\(s\): iphone-69/);
    const l = cliErr(ws, "build", "-l", "fr");
    expect(l.code).not.toBe(0);
    expect(l.err).toMatch(/Unknown locale\(s\): fr/);
    const j = cliErr(ws, "build", "--jobs", "abc");
    expect(j.code).not.toBe(0);
    expect(j.err).toMatch(/--jobs must be/);
    expect(cliErr(ws, "build", "--jobs", "0").code).not.toBe(0);
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
