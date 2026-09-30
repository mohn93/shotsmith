import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claimsForLocale, loadClaims, validateClaims } from "../src/config/claims.js";
import { formatFinding } from "../src/checks/findings.js";
import { tempDir } from "./helpers.js";

const claims = {
  "opener.headline": { source: "store-copy: Fresh ideas for your table", text: { en: "Fresh ideas for your table.", de: "Frische Ideen." } },
  "opener.sub": { source: " ", text: { en: "Find dinner fast." } },
};

describe("claims file", () => {
  it("loads, and returns {} when missing", () => {
    const dir = tempDir("claims-");
    expect(loadClaims(dir)).toEqual({});
    fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify(claims));
    expect(Object.keys(loadClaims(dir))).toEqual(["opener.headline", "opener.sub"]);
  });

  it("picks one locale", () => {
    expect(claimsForLocale(claims, "de")).toEqual({ "opener.headline": "Frische Ideen." });
  });

  it("reports empty sources and missing locale text", () => {
    const f = validateClaims(claims, ["en", "de"]);
    expect(f.map((x) => x.rule).sort()).toEqual(["claims.locale", "claims.source"]);
    expect(f.find((x) => x.rule === "claims.locale")).toMatchObject({ severity: "error", locale: "de" });
    expect(formatFinding(f[0])).toMatch(/^error claims\./);
  });

  it("throws on schema-invalid claims.json", () => {
    const dir = tempDir("claims-");
    fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify({ "bad id!": { source: "s", text: {} } }));
    expect(() => loadClaims(dir)).toThrow(/claims\.json/);
  });

  it("throws on malformed claims.json", () => {
    const dir = tempDir("claims-");
    fs.writeFileSync(path.join(dir, "claims.json"), '{"a": ,}');
    expect(() => loadClaims(dir)).toThrow(/claims\.json/);
  });
});
