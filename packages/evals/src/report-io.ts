import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diffReports, renderHtml, type EvalReport, type ReportDiff } from "./report.js";

function reportsDir(evalsRoot: string): string {
  return join(evalsRoot, "reports");
}

export async function loadPreviousReport(evalsRoot: string): Promise<EvalReport | undefined> {
  try {
    const raw = await readFile(join(reportsDir(evalsRoot), "latest.json"), "utf8");
    return JSON.parse(raw) as EvalReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// Diffs against whatever was already at latest.json, then overwrites it —
// "the previous run" is always exactly one sweep back, no timestamped
// archive to manage.
export async function writeReport(evalsRoot: string, report: EvalReport): Promise<ReportDiff> {
  const previous = await loadPreviousReport(evalsRoot);
  const diff = diffReports(report, previous);

  await mkdir(reportsDir(evalsRoot), { recursive: true });
  await writeFile(join(reportsDir(evalsRoot), "latest.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(reportsDir(evalsRoot), "latest.html"), renderHtml(report, diff), "utf8");

  return diff;
}
