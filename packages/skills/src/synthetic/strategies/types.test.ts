import { describe, expect, it } from "vitest";
import { generateSyntheticSkills } from "../generate.js";
import { fromApiToolName, toApiToolName } from "./types.js";

describe("toApiToolName / fromApiToolName", () => {
  it("produces names Anthropic's tool.name pattern accepts", () => {
    for (const skill of generateSyntheticSkills()) {
      expect(toApiToolName(skill.name)).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    }
  });

  it("round-trips every synthetic skill name", () => {
    for (const skill of generateSyntheticSkills()) {
      expect(fromApiToolName(toApiToolName(skill.name))).toBe(skill.name);
    }
  });
});
