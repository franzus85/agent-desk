import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir, parseSkillFile } from "./loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const realSkillsDir = join(here, "..", "skills");

describe("parseSkillFile", () => {
  it("parses frontmatter and keeps the body as raw markdown", () => {
    const skill = parseSkillFile(
      `---
name: example
description: An example skill.
requires: [a.tool, b.tool]
---

## Steps
1. Do the thing.
`,
      "example.md",
    );

    expect(skill).toEqual({
      name: "example",
      description: "An example skill.",
      requires: ["a.tool", "b.tool"],
      body: "## Steps\n1. Do the thing.",
    });
  });

  it("defaults requires to an empty array when omitted", () => {
    const skill = parseSkillFile(
      `---
name: example
description: An example skill.
---
body text
`,
      "example.md",
    );
    expect(skill.requires).toEqual([]);
  });

  it("throws when frontmatter delimiters are missing", () => {
    expect(() => parseSkillFile("no frontmatter here", "bad.md")).toThrow(/missing YAML frontmatter/);
  });

  it("throws when a required frontmatter field is missing", () => {
    expect(() =>
      parseSkillFile(
        `---
name: example
---
body
`,
        "bad.md",
      ),
    ).toThrow(/invalid frontmatter/);
  });
});

describe("loadSkillsFromDir", () => {
  it("loads the committed hand-written skills", async () => {
    const skills = await loadSkillsFromDir(realSkillsDir);
    const names = skills.map((skill) => skill.name).sort();
    expect(names).toEqual(["meeting-prep", "weekly-status-report"]);
  });
});
