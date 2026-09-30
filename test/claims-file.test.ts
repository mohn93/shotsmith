import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claimsForLocale, loadClaims, validateClaims } from "../src/config/claims.js";
import { formatFinding } from "../src/checks/findings.js";

const claims = {
  "opener.headline": { source: "store-copy: Fresh ideas for your table", text: { en: "Fresh ideas for your table.", de: "Frische Ideen." } },
  "opener.sub": { source: " ", text: { en: "Find dinner fast." } },
};

describe("claims file", () => {
  it("loads, and returns {} when missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claims-"));
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
});
