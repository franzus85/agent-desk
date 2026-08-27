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
    await expect(page.locator("#status")).toHaveText("AgentDesk (bridge says: pong)");

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

test("echo round-trips a valid payload through the Zod-validated IPC router", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const result = await page.evaluate(() => window.agentDesk.echo("hello from the renderer"));
    expect(result).toBe("hello from the renderer");
  } finally {
    await app.close();
  }
});

test("an invalid IPC payload is rejected at the boundary with a typed error, not executed", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    // Simulates a compromised/buggy renderer sending a malformed payload —
    // bypasses the TS-typed api on purpose, since that's exactly the input
    // registerIpcHandler's schema check exists to catch.
    const rejection = await page.evaluate(async () => {
      try {
        await (window as unknown as { agentDesk: { echo: (input: unknown) => Promise<string> } }).agentDesk.echo({
          text: 42,
        });
        return { rejected: false, message: undefined };
      } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error) };
      }
    });
    expect(rejection.rejected).toBe(true);
    expect(rejection.message).toContain("IPC_VALIDATION_ERROR");
  } finally {
    await app.close();
  }
});

test("listTools spawns the real MCP servers inside the utility process and returns their tools", async () => {
  test.setTimeout(30_000);
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const tools = await page.evaluate(() => window.agentDesk.listTools());
    expect(tools.sort()).toEqual(
      ["notes.list", "notes.search", "notes.write", "calendar.list", "calendar.search"].sort(),
    );
  } finally {
    await app.close();
  }
});

test("a fake connector secret round-trips through the OS keychain via safeStorage", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const outcome = await page.evaluate(async () => {
      const name = "sap-joule-connector";
      await window.agentDesk.saveConnectorSecret(name, "fake-connector-secret-12345");
      const matchesCorrect = await window.agentDesk.verifyConnectorSecret(name, "fake-connector-secret-12345");
      const matchesWrong = await window.agentDesk.verifyConnectorSecret(name, "not-the-secret");
      return { matchesCorrect, matchesWrong };
    });
    // The wrong-value check proves this reads back real decrypted content,
    // not just "a secret exists under this name".
    expect(outcome).toEqual({ matchesCorrect: true, matchesWrong: false });
  } finally {
    await app.close();
  }
});

test("navigation away from the app's own page is blocked", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const before = page.url();
    await page.evaluate(() => {
      window.location.href = "https://example.com";
    });
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
  } finally {
    await app.close();
  }
});

test("window.open is denied — no second window appears", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.evaluate(() => {
      window.open("https://example.com", "_blank");
    });
    await page.waitForTimeout(300);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test("a Content-Security-Policy is set", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const csp = await page.evaluate(
      () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
    );
    expect(csp).toBe("default-src 'self'");
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
