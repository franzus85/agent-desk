import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTasksFromDir, parseTaskFile } from "./task-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const realTasksDir = join(here, "..", "..", "..", "evals", "tasks");

const validTaskYaml = `
id: weekly-report-happy
prompt: "Write my weekly status report."
fixtures: seed-week-34
expect:
  outcome:
    - type: file_exists
      path: weekly-report.md
    - type: contains_all
      values: ["Q3 planning review"]
    - type: not_contains
      values: ["Project Cygnus"]
  trajectory:
    must_call: [calendar.list, notes.search, notes.write]
    must_not_call: [wiki.search]
    max_steps: 8
  judge:
    rubric: rubrics/status-report.md
`;

describe("parseTaskFile", () => {
  it("parses a full task definition", () => {
    const task = parseTaskFile(validTaskYaml, "weekly-report-happy.yaml");
    expect(task).toEqual({
      id: "weekly-report-happy",
      prompt: "Write my weekly status report.",
      fixtures: "seed-week-34",
      expect: {
        outcome: [
          { type: "file_exists", path: "weekly-report.md" },
          { type: "contains_all", values: ["Q3 planning review"] },
          { type: "not_contains", values: ["Project Cygnus"] },
        ],
        trajectory: {
          must_call: ["calendar.list", "notes.search", "notes.write"],
          must_not_call: ["wiki.search"],
          max_steps: 8,
        },
        judge: { rubric: "rubrics/status-report.md" },
      },
    });
  });

  it("defaults outcome checks and trajectory call lists when omitted", () => {
    const task = parseTaskFile(
      `
id: minimal
prompt: "Do the minimal thing."
fixtures: seed-week-34
expect:
  trajectory:
    max_steps: 4
`,
      "minimal.yaml",
    );
    expect(task.expect.outcome).toEqual([]);
    expect(task.expect.trajectory.must_call).toEqual([]);
    expect(task.expect.trajectory.must_not_call).toEqual([]);
    expect(task.expect.judge).toBeUndefined();
  });

  it("throws when an outcome check has an unknown type", () => {
    expect(() =>
      parseTaskFile(
        `
id: bad
prompt: "x"
fixtures: seed-week-34
expect:
  outcome:
    - type: not_a_real_check
  trajectory:
    max_steps: 1
`,
        "bad.yaml",
      ),
    ).toThrow(/invalid/);
  });

  it("throws when max_steps is missing", () => {
    expect(() =>
      parseTaskFile(
        `
id: bad
prompt: "x"
fixtures: seed-week-34
expect:
  trajectory: {}
`,
        "bad.yaml",
      ),
    ).toThrow(/invalid/);
  });
});

describe("loadTasksFromDir", () => {
  it("loads the committed example task", async () => {
    const tasks = await loadTasksFromDir(realTasksDir);
    const ids = tasks.map((task) => task.id);
    expect(ids).toContain("weekly-report-happy");
  });
});
