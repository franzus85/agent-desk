import type Anthropic from "@anthropic-ai/sdk";
import type { SyntheticSkillSpec } from "../generate.js";
import { fromApiToolName, toApiToolName, type SelectionResult, type SelectionStrategy } from "./types.js";

// Selection is scored on tool *name* only — none of these skills are
// actually invoked — so every tool gets the same permissive placeholder
// schema instead of a real one.
const PLACEHOLDER_INPUT_SCHEMA: Anthropic.Tool.InputSchema = { type: "object", properties: {}, additionalProperties: true };

function toolsFromSkills(skills: SyntheticSkillSpec[]): Anthropic.Tool[] {
  return skills.map((skill) => ({
    name: toApiToolName(skill.name),
    description: skill.description,
    input_schema: PLACEHOLDER_INPUT_SCHEMA,
  }));
}

// Baseline: every skill goes into the tools array, unfiltered. This is what
// "just give the model everything" costs in tokens/latency/accuracy as the
// skill count grows — the number every filtering/retrieval strategy has to
// beat.
export const naiveStrategy: SelectionStrategy = {
  name: "naive",
  async select(client, task, skills) {
    const start = performance.now();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      tools: toolsFromSkills(skills),
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: task.prompt }],
    });
    const latencyMs = performance.now() - start;

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    return {
      toolName: toolUse ? fromApiToolName(toolUse.name) : null,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
    };
  },
};
