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
  startRun: { input: z.object({ prompt: z.string() }) },
  cancelRun: { input: z.undefined() },
} as const;

// main -> renderer push channel (webContents.send), not part of the
// renderer -> main request router above — outbound data from the
// privileged process doesn't cross the untrusted-input boundary the Zod
// validation exists for.
export const AGENT_EVENT_CHANNEL = "agent-event";

export type IpcChannel = keyof typeof ipcChannels;
