import { type Browser, chromium } from "playwright";

// macOS renders WebGL on the GPU through Metal; Linux uses SwiftShader so headless CI works without a GPU.
export function chromiumArgs(platform: NodeJS.Platform = process.platform): string[] {
  return platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];
}

export async function launch(platform: NodeJS.Platform = process.platform): Promise<Browser> {
  try {
    return await chromium.launch({ args: chromiumArgs(platform) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Executable doesn't exist")) {
      const cmd = platform === "linux" ? "npx playwright install --with-deps chromium" : "npx playwright install chromium";
      throw new Error(`Chromium for Playwright is not installed. Run: ${cmd}`);
    }
    throw new Error(`Chromium failed to start: ${message}`);
  }
}
