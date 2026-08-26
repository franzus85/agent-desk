import type Anthropic from "@anthropic-ai/sdk";
import type { SyntheticSkillSpec } from "../generate.js";
import type { SelectionTask } from "../tasks.js";

export interface SelectionResult {
  toolName: string | null;
  skillsConsidered: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  // 1-indexed position of the expected tool in a ranking strategy's full
  // (pre-top-K) ranking, if it produced one. undefined for non-ranking
  // strategies (naive) — never set instead of guessed at.
  expectedToolRank?: number;
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

// Selection is scored on tool *name* only — none of these skills are
// actually invoked — so every tool gets the same permissive placeholder
// schema instead of a real one.
export const PLACEHOLDER_INPUT_SCHEMA: Anthropic.Tool.InputSchema = { type: "object", properties: {}, additionalProperties: true };

function toolsFromSkills(skills: SyntheticSkillSpec[]): Anthropic.Tool[] {
  return skills.map((skill) => ({
    name: toApiToolName(skill.name),
    description: skill.description,
    input_schema: PLACEHOLDER_INPUT_SCHEMA,
  }));
}

// Shared by every strategy: whatever candidate subset a strategy narrowed
// the 144 skills down to, ask Haiku to pick one from it and measure the
// result. Only the *filtering* differs between strategies — this call step
// doesn't, so it lives here instead of being duplicated per strategy.
export async function selectFromCandidates(
  client: Anthropic,
  task: SelectionTask,
  candidates: SyntheticSkillSpec[],
): Promise<SelectionResult> {
  const start = performance.now();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    tools: toolsFromSkills(candidates),
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: task.prompt }],
  });
  const latencyMs = performance.now() - start;

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  return {
    toolName: toolUse ? fromApiToolName(toolUse.name) : null,
    skillsConsidered: candidates.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
  };
}
