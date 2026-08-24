import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

// Receives the first request and dies without ever responding —
// simulates a server crashing mid-call.
rl.once("line", () => {
  process.exit(1);
});
