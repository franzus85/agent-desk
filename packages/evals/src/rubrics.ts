import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Rubric paths in a task file (e.g. "rubrics/status-report.md") are relative
// to the evals root, same as tasks/ and fixtures/.
export function loadRubric(evalsRoot: string, relativePath: string): Promise<string> {
  return readFile(join(evalsRoot, relativePath), "utf8");
}
