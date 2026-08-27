import electron from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessRequest, HarnessResponse } from "../shared/harness-messages.js";

const { utilityProcess } = electron;

const here = dirname(fileURLToPath(import.meta.url));

let child: ReturnType<typeof utilityProcess.fork> | undefined;
let pendingResolve: ((response: HarnessResponse) => void) | undefined;

function ensureChild(): ReturnType<typeof utilityProcess.fork> {
  if (child) return child;
  const proc = utilityProcess.fork(join(here, "..", "utility", "harness-process.mjs"));
  proc.on("message", (response: HarnessResponse) => {
    pendingResolve?.(response);
    pendingResolve = undefined;
  });
  proc.on("exit", (code) => {
    console.error("[main] harness utility process exited", code);
    child = undefined;
  });
  child = proc;
  return proc;
}

// One request in flight at a time — enough for this step's proof (a single
// list-tools round trip); a real task queue is a later concern once the UI
// actually needs to issue overlapping requests.
export function sendToHarness(request: HarnessRequest): Promise<HarnessResponse> {
  if (pendingResolve) {
    return Promise.reject(new Error("A harness request is already in flight."));
  }
  return new Promise((resolve) => {
    pendingResolve = resolve;
    ensureChild().postMessage(request);
  });
}
