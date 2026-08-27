import { join } from "node:path";
import type { OutcomeCheck } from "./schema.js";
import { pathExists } from "./fs-utils.js";

export interface OutcomeContext {
  // Root that file_exists paths are resolved against — the seeded notes dir.
  workspaceDir: string;
  // contains_all/not_contains check the agent's final response text, not a
  // file: they assert on what the agent told the user, not on an artifact.
  finalResponseText: string;
}

export interface OutcomeCheckResult {
  check: OutcomeCheck;
  passed: boolean;
  reason: string;
}

export interface OutcomeScore {
  passed: boolean;
  results: OutcomeCheckResult[];
}

async function evaluateCheck(check: OutcomeCheck, context: OutcomeContext): Promise<OutcomeCheckResult> {
  switch (check.type) {
    case "file_exists": {
      const found = await pathExists(join(context.workspaceDir, check.path));
      return { check, passed: found, reason: found ? `found ${check.path}` : `missing ${check.path}` };
    }
    case "contains_all": {
      const missing = check.values.filter((value) => !context.finalResponseText.includes(value));
      return {
        check,
        passed: missing.length === 0,
        reason: missing.length === 0 ? "all values present" : `missing: ${missing.join(", ")}`,
      };
    }
    case "not_contains": {
      const present = check.values.filter((value) => context.finalResponseText.includes(value));
      return {
        check,
        passed: present.length === 0,
        reason: present.length === 0 ? "none of the forbidden values present" : `found forbidden: ${present.join(", ")}`,
      };
    }
  }
}

export async function scoreOutcome(checks: OutcomeCheck[], context: OutcomeContext): Promise<OutcomeScore> {
  const results = await Promise.all(checks.map((check) => evaluateCheck(check, context)));
  return { passed: results.every((result) => result.passed), results };
}
