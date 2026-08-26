import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { skillFrontmatterSchema, type Skill } from "./schema.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseSkillFile(fileContents: string, sourcePath: string): Skill {
  const match = FRONTMATTER_PATTERN.exec(fileContents);
  if (!match) {
    throw new Error(`Skill file "${sourcePath}" is missing YAML frontmatter (--- ... ---).`);
  }

  const [, frontmatterText, body] = match;
  const rawFrontmatter = parseYaml(frontmatterText ?? "");
  const parsed = skillFrontmatterSchema.safeParse(rawFrontmatter);
  if (!parsed.success) {
    throw new Error(`Skill file "${sourcePath}" has invalid frontmatter: ${parsed.error.message}`);
  }

  return { ...parsed.data, body: (body ?? "").trim() };
}

export async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  const entries = await readdir(dir);
  const skills: Skill[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".md"))) {
    const filePath = join(dir, entry);
    const contents = await readFile(filePath, "utf8");
    skills.push(parseSkillFile(contents, filePath));
  }
  return skills;
}
