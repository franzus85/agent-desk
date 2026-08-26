import type Anthropic from "@anthropic-ai/sdk";
import type { SyntheticSkillSpec } from "../generate.js";
import type { SelectionTask } from "../tasks.js";

export interface SelectionResult {
  toolName: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface SelectionStrategy {
  name: string;
  select(client: Anthropic, task: SelectionTask, skills: SyntheticSkillSpec[]): Promise<SelectionResult>;
}

// Anthropic's tool.name must match ^[a-zA-Z0-9_-]{1,128}$ — no dots — but our
// skill names use "domain.verb_object" namespacing (mirroring the MCP
// registry's own ${serverId}.${toolName} convention). Every strategy that
// sends skills to the real API needs this same round-trip, so it lives here
// rather than being duplicated per strategy.
export function toApiToolName(skillName: string): string {
  return skillName.replace(/\./g, "__");
}

export function fromApiToolName(apiToolName: string): string {
  return apiToolName.replace(/__/g, ".");
}
