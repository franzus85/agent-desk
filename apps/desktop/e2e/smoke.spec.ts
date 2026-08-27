import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [appRoot],
    // The sandbox this suite runs in sets ELECTRON_RUN_AS_NODE=1 globally
    // (presumably to stop stray GUI launches from arbitrary tool calls) —
    // that forces the Electron binary to behave as plain Node, so nothing
    // ever boots. Clear it for this one child process; a real dev machine
    // running `pnpm test:e2e` directly won't have it set at all.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
}

test("window boots with the expected title", async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("AgentDesk");
  } finally {
    await app.close();
  }
});

test("renderer has no Node access — sandbox:true, contextIsolation:true, nodeIntegration:false all hold", async () => {
  const app = await launchApp();
  try {
    const window = await app.firstWindow();
    const nodeAccess = await window.evaluate(() => ({
      hasRequire: typeof (globalThis as Record<string, unknown>)["require"] !== "undefined",
      hasModule: typeof (globalThis as Record<string, unknown>)["module"] !== "undefined",
      hasFullProcess: typeof process !== "undefined" && typeof process.version === "string",
    }));
    expect(nodeAccess).toEqual({ hasRequire: false, hasModule: false, hasFullProcess: false });
  } finally {
    await app.close();
  }
});
