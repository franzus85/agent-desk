import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { FileCheckpointSaver } from "./checkpointer.js";

describe("FileCheckpointSaver", () => {
  it("a fresh instance rehydrates a checkpoint a previous instance wrote — this is the whole restart-survival mechanism", async () => {
    const dir = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
    const filePath = join(dir, "checkpoint.json");
    try {
      const config = { configurable: { thread_id: "t1" } };
      const checkpoint = { ...emptyCheckpoint(), channel_values: { task: "find the contact", attempts: 0 } };

      const before = new FileCheckpointSaver(filePath);
      const savedConfig = await before.put(config, checkpoint, { source: "input", step: 0, parents: {} });

      // A brand-new instance, as if this were a new process — the only
      // thing it has is the file path, nothing carried over in memory.
      const after = new FileCheckpointSaver(filePath);
      const tuple = await after.getTuple(savedConfig);

      expect(tuple?.checkpoint.channel_values).toEqual({ task: "find the contact", attempts: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts empty when no file exists yet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
    try {
      const saver = new FileCheckpointSaver(join(dir, "does-not-exist.json"));
      const tuple = await saver.getTuple({ configurable: { thread_id: "missing" } });
      expect(tuple).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
