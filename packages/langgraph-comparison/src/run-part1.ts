// Part 1 of the checkpoint-survives-a-restart demo. Runs the graph until
// it hits the human-in-the-loop interrupt, then this process exits — no
// state kept anywhere except the checkpoint file. Run with:
//   pnpm --filter @agent-desk/langgraph-comparison exec tsx src/run-part1.ts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FileCheckpointSaver } from "./checkpointer.js";
import { buildGraph } from "./graph.js";

const here = dirname(fileURLToPath(import.meta.url));
export const CHECKPOINT_PATH = join(here, "..", ".demo-checkpoint.json");
export const THREAD_ID = "demo-thread-1";

const checkpointer = new FileCheckpointSaver(CHECKPOINT_PATH);
const graph = buildGraph(checkpointer);
const config = { configurable: { thread_id: THREAD_ID } };

const result = await graph.invoke({ task: "Find the contact named Jane Doe", attempts: 0 }, config);
console.log("=== Part 1: invoke() result (graph is now paused at the interrupt) ===");
console.log(JSON.stringify(result, null, 2));

const state = await graph.getState(config);
console.log("\n=== Part 1: pending interrupt, read back from the checkpoint ===");
console.log(JSON.stringify(state.tasks, null, 2));
console.log(`\nCheckpoint written to ${CHECKPOINT_PATH}. Process exiting now — run-part2.ts resumes it cold.`);
