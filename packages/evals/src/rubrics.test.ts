import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRubric } from "./rubrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const realEvalsRoot = join(here, "..", "..", "..", "evals");

describe("loadRubric", () => {
  it("loads the committed example rubric", async () => {
    const rubric = await loadRubric(realEvalsRoot, "rubrics/status-report.md");
    expect(rubric).toContain("Rubric: Weekly status report");
  });
});
