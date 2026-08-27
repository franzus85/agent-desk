import electron from "electron";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessRequest, HarnessResponse } from "../shared/harness-messages.js";

const { utilityProcess } = electron;

const here = dirname(fileURLToPath(import.meta.url));

const events = new EventEmitter();
let child: ReturnType<typeof utilityProcess.fork> | undefined;

function ensureChild(): ReturnType<typeof utilityProcess.fork> {
  if (child) return child;
  const proc = utilityProcess.fork(join(here, "..", "utility", "harness-process.mjs"));
  proc.on("message", (response: HarnessResponse) => events.emit("message", response));
  proc.on("exit", (code) => {
    console.error("[main] harness utility process exited", code);
    child = undefined;
  });
  child = proc;
  return proc;
}

// One-shot request/response — fine for list-tools, which always replies
// with exactly one message.
export function sendToHarness(request: HarnessRequest): Promise<HarnessResponse> {
  return new Promise((resolve) => {
    events.once("message", resolve);
    ensureChild().postMessage(request);
  });
}

// start-run's replies are a *stream* of agent-event messages, not a single
// reply — callers (index.ts, wiring it to webContents.send) subscribe here
// instead of awaiting a promise.
export function onHarnessMessage(listener: (response: HarnessResponse) => void): () => void {
  ensureChild();
  events.on("message", listener);
  return () => events.off("message", listener);
}

export function postToHarness(request: HarnessRequest): void {
  ensureChild().postMessage(request);
}
