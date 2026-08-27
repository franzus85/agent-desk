// Named ESM imports from "electron" don't resolve reliably — Electron's
// own module is a CJS shim that Node's ESM/CJS interop doesn't statically
// analyze the same way it does an ordinary CJS package. Default import +
// destructure at runtime is the documented workaround.
import electron from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { app, BrowserWindow } = electron;

const here = dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
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
