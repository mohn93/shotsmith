import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type Finding, err } from "../checks/findings.js";

const Schema = z.record(z.string().regex(/^[\w.-]+$/), z.object({ source: z.string(), text: z.record(z.string(), z.string()) }));
export type Claims = z.infer<typeof Schema>;

export function loadClaims(root: string): Claims {
  const file = path.join(root, "claims.json");
  if (!fs.existsSync(file)) return {};
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`claims.json: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = Schema.safeParse(data);
  if (!parsed.success) throw new Error(`claims.json: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function claimsForLocale(claims: Claims, code: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, c] of Object.entries(claims)) if (c.text[code] !== undefined) out[id] = c.text[code];
  return out;
}

export function validateClaims(claims: Claims, locales: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const [id, c] of Object.entries(claims)) {
    if (!c.source.trim()) findings.push(err("claims.source", `"${id}" has no source; name the store copy line or capture it comes from`));
    for (const code of locales) {
      if (!c.text[code]?.trim()) findings.push(err("claims.locale", `"${id}" has no text for ${code}`, { locale: code }));
    }
  }
  return findings;
}
