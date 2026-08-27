// Named ESM imports from "electron" don't resolve reliably — Electron's
// own module is a CJS shim that Node's ESM/CJS interop doesn't statically
// analyze the same way it does an ordinary CJS package. Default import +
// destructure at runtime is the documented workaround.
import electron from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandler } from "./ipc-router.js";
import { onHarnessMessage, postToHarness, sendToHarness } from "./harness-bridge.js";
import { loadSecret, saveSecret } from "./secret-store.js";
import { AGENT_EVENT_CHANNEL } from "../shared/ipc-channels.js";

const { app, BrowserWindow, ipcMain } = electron;

const here = dirname(fileURLToPath(import.meta.url));

registerIpcHandler(ipcMain, "ping", () => "pong");
registerIpcHandler(ipcMain, "echo", ({ text }) => text);
registerIpcHandler(ipcMain, "listTools", async () => {
  const response = await sendToHarness({ type: "list-tools" });
  if (response.type !== "list-tools-result") {
    throw new Error(response.type === "error" ? response.message : `Unexpected response type "${response.type}" for list-tools.`);
  }
  return response.tools;
});
registerIpcHandler(ipcMain, "saveConnectorSecret", async ({ name, value }) => {
  await saveSecret(name, value);
});
registerIpcHandler(ipcMain, "verifyConnectorSecret", async ({ name, expected }) => {
  const actual = await loadSecret(name);
  return actual === expected;
});
registerIpcHandler(ipcMain, "startRun", ({ prompt }) => {
  postToHarness({ type: "start-run", prompt });
});
registerIpcHandler(ipcMain, "cancelRun", () => {
  postToHarness({ type: "cancel-run" });
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

  // Navigation lockdown. Nothing in this app should ever navigate the
  // window away from its own local renderer page or open a new window —
  // there is no legitimate reason for either, and both are exactly what a
  // successful injection into rendered/model-generated content would try
  // first. shell.openExternal is simply never imported anywhere, so no
  // model-generated URL has a code path to reach it at all.
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Push every AgentEvent from the utility process straight to this
  // window's renderer. This is main -> renderer, the trusted direction —
  // the Zod router (Step 3) validates the untrusted renderer -> main
  // direction only.
  const unsubscribe = onHarnessMessage((response) => {
    if (response.type === "agent-event" && !win.isDestroyed()) {
      win.webContents.send(AGENT_EVENT_CHANNEL, response.event);
    }
  });
  win.on("closed", unsubscribe);

  void win.loadFile(join(here, "..", "renderer", "index.html"));
}

void app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
