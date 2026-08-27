import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreOutcome } from "./outcome-scorer.js";
import type { OutcomeCheck } from "./schema.js";

describe("scoreOutcome", () => {
  it("passes when every check passes", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "outcome-scorer-test-"));
    try {
      await writeFile(join(workspaceDir, "weekly-report.md"), "irrelevant to contains checks", "utf8");

      const checks: OutcomeCheck[] = [
        { type: "file_exists", path: "weekly-report.md" },
        { type: "contains_all", values: ["Project Atlas", "Q3 planning review"] },
        { type: "not_contains", values: ["Project Cygnus"] },
      ];
      const score = await scoreOutcome(checks, {
        workspaceDir,
        finalResponseText: "Weekly report sent, covering Project Atlas and the Q3 planning review.",
      });

      expect(score.passed).toBe(true);
      expect(score.results.every((result) => result.passed)).toBe(true);
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("fails file_exists when the file is missing, independent of the other checks", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "outcome-scorer-test-"));
    try {
      const score = await scoreOutcome([{ type: "file_exists", path: "weekly-report.md" }], {
        workspaceDir,
        finalResponseText: "anything",
      });
      expect(score.passed).toBe(false);
      expect(score.results[0]).toMatchObject({ passed: false, reason: "missing weekly-report.md" });
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("fails contains_all and reports which values were missing", async () => {
    const score = await scoreOutcome(
      [{ type: "contains_all", values: ["Project Atlas", "Project Beacon"] }],
      { workspaceDir: "/unused", finalResponseText: "Only mentions Project Atlas." },
    );
    expect(score.passed).toBe(false);
    expect(score.results[0]).toMatchObject({ passed: false, reason: "missing: Project Beacon" });
  });

  it("fails not_contains when a forbidden value is present", async () => {
    const score = await scoreOutcome(
      [{ type: "not_contains", values: ["Project Cygnus"] }],
      { workspaceDir: "/unused", finalResponseText: "Also touched on Project Cygnus this week." },
    );
    expect(score.passed).toBe(false);
    expect(score.results[0]).toMatchObject({ passed: false, reason: "found forbidden: Project Cygnus" });
  });

  it("passes trivially when there are no checks", async () => {
    const score = await scoreOutcome([], { workspaceDir: "/unused", finalResponseText: "" });
    expect(score).toEqual({ passed: true, results: [] });
  });
});
