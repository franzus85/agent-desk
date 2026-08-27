import type { IpcMain } from "electron";
import type { z } from "zod";
import { ipcChannels, type IpcChannel } from "../shared/ipc-channels.js";

// Message text crosses the ipcMain.handle -> ipcRenderer.invoke boundary
// reliably (unlike custom Error subclasses/names, which aren't guaranteed
// to survive serialization) — the prefix is what callers match on.
export const IPC_VALIDATION_ERROR_PREFIX = "IPC_VALIDATION_ERROR";

type ChannelInput<Channel extends IpcChannel> = z.infer<(typeof ipcChannels)[Channel]["input"]>;

export function registerIpcHandler<Channel extends IpcChannel>(
  ipcMain: IpcMain,
  channel: Channel,
  handler: (input: ChannelInput<Channel>) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(channel, async (_event, rawPayload: unknown) => {
    const parsed = ipcChannels[channel].input.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`${IPC_VALIDATION_ERROR_PREFIX} channel="${channel}": ${parsed.error.message}`);
    }
    return handler(parsed.data as ChannelInput<Channel>);
  });
}
