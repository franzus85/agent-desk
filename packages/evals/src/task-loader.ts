import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { taskSchema, type Task } from "./schema.js";

export function parseTaskFile(fileContents: string, sourcePath: string): Task {
  const raw: unknown = parseYaml(fileContents);
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Task file "${sourcePath}" is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function loadTasksFromDir(dir: string): Promise<Task[]> {
  const entries = await readdir(dir);
  const tasks: Task[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))) {
    const filePath = join(dir, entry);
    const contents = await readFile(filePath, "utf8");
    tasks.push(parseTaskFile(contents, filePath));
  }
  return tasks;
}
