import { z } from "zod";

// Explicit, closed set of channels — no dynamic channel names anywhere.
// Each entry's input schema is what the main process validates renderer
// payloads against; renderer input is untrusted input.
export const ipcChannels = {
  ping: { input: z.undefined() },
  echo: { input: z.object({ text: z.string() }) },
  listTools: { input: z.undefined() },
  saveConnectorSecret: { input: z.object({ name: z.string(), value: z.string() }) },
  // Verifies round-trip integrity without ever sending the decrypted
  // secret back to the renderer — the boolean is the whole answer.
  verifyConnectorSecret: { input: z.object({ name: z.string(), expected: z.string() }) },
} as const;

export type IpcChannel = keyof typeof ipcChannels;
