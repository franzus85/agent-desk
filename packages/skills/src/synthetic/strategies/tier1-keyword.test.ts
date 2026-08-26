import { describe, expect, it } from "vitest";
import { generateSyntheticSkills } from "../generate.js";
import { selectionTasks } from "../tasks.js";
import { keywordFilter } from "./tier1-keyword.js";

describe("keywordFilter", () => {
  const skills = generateSyntheticSkills();

  it("never returns more than topK skills", () => {
    for (const task of selectionTasks) {
      expect(keywordFilter(task.prompt, skills).length).toBeLessThanOrEqual(10);
    }
  });

  it("keeps the expected tool in the candidate set for every easy task", () => {
    for (const task of selectionTasks.filter((t) => t.difficulty === "easy")) {
      const names = keywordFilter(task.prompt, skills).map((skill) => skill.name);
      expect(names, task.id).toContain(task.expectedTool);
    }
  });
});
