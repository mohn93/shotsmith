import { type Browser, chromium } from "playwright";

// macOS renders WebGL on the GPU through Metal; Linux uses SwiftShader so headless CI works without a GPU.
export function chromiumArgs(platform: NodeJS.Platform = process.platform): string[] {
  return platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];
}

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ args: chromiumArgs() });
  } catch (e) {
    if (/Executable doesn't exist|browserType\.launch/i.test((e as Error).message)) {
      throw new Error("Chromium for Playwright is not installed. Run: npx playwright install chromium");
    }
    throw e;
  }
}
