import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toMarkdown, type SyntheticSkillSpec } from "./generate.js";

export async function writeSyntheticSkills(outDir: string, specs: SyntheticSkillSpec[]): Promise<void> {
  await mkdir(outDir, { recursive: true });

  // Clear any previously generated files first so a shrinking domain list
  // can't leave stale skills behind.
  const existing = await readdir(outDir);
  await Promise.all(existing.filter((name) => name.endsWith(".md")).map((name) => unlink(join(outDir, name))));

  await Promise.all(specs.map((spec) => writeFile(join(outDir, `${spec.name}.md`), toMarkdown(spec), "utf8")));
}
