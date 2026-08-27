import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPreviousReport, writeReport } from "./report-io.js";
import type { EvalReport } from "./report.js";

async function withTempEvalsRoot(fn: (evalsRoot: string) => Promise<void>): Promise<void> {
  const evalsRoot = await mkdtemp(join(tmpdir(), "agent-desk-report-io-test-"));
  try {
    await fn(evalsRoot);
  } finally {
    await rm(evalsRoot, { recursive: true, force: true });
  }
}

const report: EvalReport = {
  generatedAt: "2026-08-27T10:00:00.000Z",
  tasks: [{ taskId: "task-a", passRate: 1, passAtLeastOnce: true, passEveryRun: true, meanSteps: 2, meanLatencyMs: 100, meanCostUsd: 0.001 }],
};

describe("loadPreviousReport", () => {
  it("returns undefined when no report has been written yet", async () => {
    await withTempEvalsRoot(async (evalsRoot) => {
      expect(await loadPreviousReport(evalsRoot)).toBeUndefined();
    });
  });
});

describe("writeReport", () => {
  it("writes latest.json and latest.html, with no diff on the first run", async () => {
    await withTempEvalsRoot(async (evalsRoot) => {
      const diff = await writeReport(evalsRoot, report);
      expect(diff.entries).toEqual([{ taskId: "task-a", status: "new", current: report.tasks[0] }]);

      const written = JSON.parse(await readFile(join(evalsRoot, "reports", "latest.json"), "utf8"));
      expect(written).toEqual(report);

      const html = await readFile(join(evalsRoot, "reports", "latest.html"), "utf8");
      expect(html).toContain("task-a");
    });
  });

  it("diffs against the previously written report, then overwrites it", async () => {
    await withTempEvalsRoot(async (evalsRoot) => {
      await writeReport(evalsRoot, report);

      const improved: EvalReport = {
        generatedAt: "2026-08-28T10:00:00.000Z",
        tasks: [{ ...report.tasks[0]!, meanCostUsd: 0.0005 }],
      };
      const diff = await writeReport(evalsRoot, improved);

      expect(diff.entries[0]).toMatchObject({ status: "compared", meanCostUsdDelta: -0.0005 });

      const loaded = await loadPreviousReport(evalsRoot);
      expect(loaded).toEqual(improved);
    });
  });
});
