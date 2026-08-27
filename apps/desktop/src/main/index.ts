// Named ESM imports from "electron" don't resolve reliably — Electron's
// own module is a CJS shim that Node's ESM/CJS interop doesn't statically
// analyze the same way it does an ordinary CJS package. Default import +
// destructure at runtime is the documented workaround.
import electron from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandler } from "./ipc-router.js";
import { sendToHarness } from "./harness-bridge.js";
import { loadSecret, saveSecret } from "./secret-store.js";

const { app, BrowserWindow, ipcMain } = electron;

const here = dirname(fileURLToPath(import.meta.url));

registerIpcHandler(ipcMain, "ping", () => "pong");
registerIpcHandler(ipcMain, "echo", ({ text }) => text);
registerIpcHandler(ipcMain, "listTools", async () => {
  const response = await sendToHarness({ type: "list-tools" });
  if (response.type === "error") throw new Error(response.message);
  return response.tools;
});
registerIpcHandler(ipcMain, "saveConnectorSecret", async ({ name, value }) => {
  await saveSecret(name, value);
});
registerIpcHandler(ipcMain, "verifyConnectorSecret", async ({ name, expected }) => {
  const actual = await loadSecret(name);
  return actual === expected;
});

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(here, "..", "preload", "index.cjs"),
    },
  });
  // Dev-time diagnostics — surfaces preload/renderer failures in the main
  // process's own terminal, since a sandboxed renderer has no other way to
  // report a load failure back to whoever is running the app.
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("preload-error", preloadPath, error);
  });
  win.webContents.on("console-message", (event) => {
    console.log("[renderer]", event.message);
  });
  void win.loadFile(join(here, "..", "renderer", "index.html"));
}

void app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
