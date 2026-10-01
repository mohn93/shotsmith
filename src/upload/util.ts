import crypto from "node:crypto";
import path from "node:path";
import type { ResolvedConfig } from "../config/schema.js";
import type { Store } from "./local.js";

export const rel = (cfg: ResolvedConfig, p: string): string => path.relative(cfg.root, p).split(path.sep).join("/");
export const md5 = (b: Buffer): string => crypto.createHash("md5").update(b).digest("hex");
export const sha256 = (b: Buffer | string): string => crypto.createHash("sha256").update(b).digest("hex");

// For configuration messages, and for plan headings.
export const STORE_NAME: Record<Store, string> = { apple: "App Store", play: "Google Play" };
export const SERVICE_NAME: Record<Store, string> = { apple: "App Store Connect", play: "Google Play" };
