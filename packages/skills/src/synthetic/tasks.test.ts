import { describe, expect, it } from "vitest";
import { generateSyntheticSkills } from "./generate.js";
import { selectionTaskSchema, selectionTasks } from "./tasks.js";

describe("selectionTasks", () => {
  it("has exactly 24 tasks, split evenly between easy and hard", () => {
    expect(selectionTasks).toHaveLength(24);
    expect(selectionTasks.filter((task) => task.difficulty === "easy")).toHaveLength(12);
    expect(selectionTasks.filter((task) => task.difficulty === "hard")).toHaveLength(12);
  });

  it("gives every task a unique id", () => {
    const ids = selectionTasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("conforms to the SelectionTask schema", () => {
    for (const task of selectionTasks) {
      expect(() => selectionTaskSchema.parse(task)).not.toThrow();
    }
  });

  it("points every expectedTool at a skill that actually exists in the synthetic corpus", () => {
    const skillNames = new Set(generateSyntheticSkills().map((skill) => skill.name));
    for (const task of selectionTasks) {
      expect(skillNames.has(task.expectedTool), `${task.id}: ${task.expectedTool} not found in corpus`).toBe(true);
    }
  });

  it("only uses the search verb (the deliberately collision-prone one)", () => {
    for (const task of selectionTasks) {
      expect(task.expectedTool).toContain(".search_");
    }
  });
});
