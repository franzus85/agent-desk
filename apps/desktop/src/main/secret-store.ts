import electron from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const { app, safeStorage } = electron;

// safeStorage encrypts with a key backed by the OS keychain (macOS
// Keychain / Windows DPAPI / libsecret on Linux) — it doesn't persist the
// bytes itself, that's still on us. This is the SAP-Joule-connector-secret
// pattern from the PRD's public write-up: never store a connector secret
// as plaintext on disk.
function secretPath(name: string): string {
  return join(app.getPath("userData"), "secrets", `${name}.enc`);
}

export async function saveSecret(name: string, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed encryption is not available on this machine.");
  }
  const encrypted = safeStorage.encryptString(value);
  const path = secretPath(name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encrypted);
}

export async function loadSecret(name: string): Promise<string | undefined> {
  try {
    const encrypted = await readFile(secretPath(name));
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
