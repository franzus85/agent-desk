import { z } from "zod";

// Explicit, closed set of channels — no dynamic channel names anywhere.
// Each entry's input schema is what the main process validates renderer
// payloads against; renderer input is untrusted input.
export const ipcChannels = {
  ping: { input: z.undefined() },
  echo: { input: z.object({ text: z.string() }) },
} as const;

export type IpcChannel = keyof typeof ipcChannels;
