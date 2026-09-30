import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("prints the package version", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const out = execFileSync("node", ["dist/cli.js", "--version"], { encoding: "utf8" }).trim();
    expect(out).toBe(pkg.version);
  });
});
