import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import type { Checkpoint, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

// MemorySaver already implements the (fairly involved) BaseCheckpointSaver
// contract correctly — channel versions, versions_seen, pending writes.
// Reimplementing that from scratch under time pressure is exactly the kind
// of place subtle bugs hide. Instead: subclass it, and after anything that
// mutates its public `storage`/`writes` maps, serialize them to disk; on
// construction, rehydrate from disk if a file is there. That's the whole
// difference between "survives a restart" and "doesn't" — same in-memory
// engine, just checkpointed to a file after every write.
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __uint8array: Buffer.from(value).toString("base64") };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && "__uint8array" in (value as Record<string, unknown>)) {
    return new Uint8Array(Buffer.from((value as { __uint8array: string }).__uint8array, "base64"));
  }
  return value;
}

export class FileCheckpointSaver extends MemorySaver {
  constructor(private readonly filePath: string) {
    super();
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8"), reviver) as { storage: unknown; writes: unknown };
      this.storage = raw.storage as typeof this.storage;
      this.writes = raw.writes as typeof this.writes;
    }
  }

  override async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig> {
    const result = await super.put(config, checkpoint, metadata);
    this.persist();
    return result;
  }

  override async putWrites(config: RunnableConfig, writes: Parameters<MemorySaver["putWrites"]>[1], taskId: string): Promise<void> {
    await super.putWrites(config, writes, taskId);
    this.persist();
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify({ storage: this.storage, writes: this.writes }, replacer));
  }
}
