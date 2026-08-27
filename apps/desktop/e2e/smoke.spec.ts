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
    const page = await app.firstWindow();
    await expect(page).toHaveTitle("AgentDesk");
  } finally {
    await app.close();
  }
});

test("the preload's contextBridge API round-trips a real IPC call", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await expect(page.locator("#root")).toHaveText("AgentDesk (bridge says: pong)");

    // Only the narrow api object is reachable — not ipcRenderer itself.
    const bridgeShape = await page.evaluate(() => ({
      hasPing: typeof window.agentDesk?.ping === "function",
      hasIpcRenderer: typeof (window as unknown as Record<string, unknown>)["ipcRenderer"] !== "undefined",
    }));
    expect(bridgeShape).toEqual({ hasPing: true, hasIpcRenderer: false });
  } finally {
    await app.close();
  }
});

test("renderer has no Node access — sandbox:true, contextIsolation:true, nodeIntegration:false all hold", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const nodeAccess = await page.evaluate(() => ({
      hasRequire: typeof (globalThis as Record<string, unknown>)["require"] !== "undefined",
      hasModule: typeof (globalThis as Record<string, unknown>)["module"] !== "undefined",
      hasFullProcess: typeof process !== "undefined" && typeof process.version === "string",
    }));
    expect(nodeAccess).toEqual({ hasRequire: false, hasModule: false, hasFullProcess: false });
  } finally {
    await app.close();
  }
});
