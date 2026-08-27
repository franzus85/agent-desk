// Part 2 of the checkpoint-survives-a-restart demo — a *separate* process
// invocation from run-part1.ts, sharing nothing but the checkpoint file on
// disk. Constructs a brand-new FileCheckpointSaver (which rehydrates from
// that file) and a brand-new graph, then resumes the same thread with the
// human's decision. Run with:
//   pnpm --filter @agent-desk/langgraph-comparison exec tsx src/run-part2.ts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@langchain/langgraph";
import { FileCheckpointSaver } from "./checkpointer.js";
import { buildGraph } from "./graph.js";

const here = dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = join(here, "..", ".demo-checkpoint.json");
const THREAD_ID = "demo-thread-1";

const checkpointer = new FileCheckpointSaver(CHECKPOINT_PATH); // <- rehydrated from disk, not from run-part1's memory
const graph = buildGraph(checkpointer);
const config = { configurable: { thread_id: THREAD_ID } };

const beforeResume = await graph.getState(config);
console.log("=== Part 2: state read back from disk, before resuming ===");
console.log(JSON.stringify({ values: beforeResume.values, next: beforeResume.next }, null, 2));

const result = await graph.invoke(new Command({ resume: { approved: true } }), config);
console.log("\n=== Part 2: final result, after resuming across the process boundary ===");
console.log(JSON.stringify(result, null, 2));
