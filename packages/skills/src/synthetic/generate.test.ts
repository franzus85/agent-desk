import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSyntheticSkills, toMarkdown } from "./generate.js";
import { writeSyntheticSkills } from "./write.js";
import { loadSkillsFromDir, parseSkillFile } from "../loader.js";

describe("generateSyntheticSkills", () => {
  it("generates exactly 144 skills (12 domains x 3 objects x 4 verbs)", () => {
    expect(generateSyntheticSkills()).toHaveLength(144);
  });

  it("gives every skill a unique name", () => {
    const names = generateSyntheticSkills().map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("deliberately collides the bare verb across every domain", () => {
    const names = generateSyntheticSkills().map((skill) => skill.name);
    const searchTools = names.filter((name) => name.includes(".search_"));
    // 12 domains x 3 objects each = 36 tools all starting with "search" —
    // the actual source of selection difficulty this corpus exists to create.
    expect(searchTools).toHaveLength(36);
  });

  it("handles irregular pluralization (policy -> policies, not policys)", () => {
    const policySkill = generateSyntheticSkills().find((skill) => skill.name === "kb.search_policy");
    expect(policySkill?.description).toContain("policies");
  });

  it("produces frontmatter our own loader can parse back (round-trip via string)", () => {
    const [first] = generateSyntheticSkills();
    if (!first) throw new Error("unreachable");
    const markdown = toMarkdown(first);
    const parsed = parseSkillFile(markdown, "in-memory");
    expect(parsed).toEqual(first);
  });
});

describe("writeSyntheticSkills", () => {
  it("writes real files that loadSkillsFromDir can load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "synthetic-skills-test-"));
    try {
      const specs = generateSyntheticSkills().slice(0, 5);
      await writeSyntheticSkills(dir, specs);

      const loaded = await loadSkillsFromDir(dir);
      expect(loaded.map((skill) => skill.name).sort()).toEqual(specs.map((spec) => spec.name).sort());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears stale files from a previous run instead of accumulating them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "synthetic-skills-test-"));
    try {
      await writeSyntheticSkills(dir, generateSyntheticSkills().slice(0, 10));
      await writeSyntheticSkills(dir, generateSyntheticSkills().slice(0, 3));

      const loaded = await loadSkillsFromDir(dir);
      expect(loaded).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
