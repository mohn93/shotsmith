import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    clean: true,
    shims: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { "kit/index": "src/kit/index.ts", "kit/three": "src/kit/three.ts" },
    format: ["esm"],
    platform: "browser",
    target: "es2022",
    clean: false,
    dts: true,
    external: ["three", /^three\//],
  },
]);
