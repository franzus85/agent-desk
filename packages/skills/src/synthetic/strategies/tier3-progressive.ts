import type Anthropic from "@anthropic-ai/sdk";
import { domains } from "../domains.js";
import { selectFromCandidates, type SelectionStrategy } from "./types.js";

const PLACEHOLDER_INPUT_SCHEMA: Anthropic.Tool.InputSchema = { type: "object", properties: {}, additionalProperties: true };

// Domain ids ("crm", "hr", ...) already satisfy the API's tool.name pattern
// directly — no dot-namespacing to strip here, unlike the individual skills.
export function domainIndexTools(): Anthropic.Tool[] {
  return domains.map((domain) => ({
    name: domain.id,
    description: `${domain.displayName} domain — handles ${domain.objects.join(", ")}.`,
    input_schema: PLACEHOLDER_INPUT_SCHEMA,
  }));
}

interface DomainPick {
  domainId: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

async function pickDomain(client: Anthropic, prompt: string): Promise<DomainPick> {
  const start = performance.now();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    tools: domainIndexTools(),
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: prompt }],
  });
  const latencyMs = performance.now() - start;

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  return {
    domainId: toolUse?.name ?? null,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
  };
}

// Coarse-to-fine, mirroring how skills are meant to be disclosed: a
// lightweight index first (12 domains), full tool specs loaded only for the
// chosen domain (12 skills) for the final pick. Two Haiku calls instead of
// one — trades latency/cost for not drowning the final decision in all 144
// candidates at once.
export const tier3ProgressiveStrategy: SelectionStrategy = {
  name: "tier3-progressive",
  async select(client, task, skills) {
    const stage1 = await pickDomain(client, task.prompt);
    const candidates = stage1.domainId ? skills.filter((skill) => skill.name.startsWith(`${stage1.domainId}.`)) : [];

    const stage2 = await selectFromCandidates(client, task, candidates);
    const rankIndex = candidates.findIndex((skill) => skill.name === task.expectedTool);

    return {
      toolName: stage2.toolName,
      skillsConsidered: candidates.length,
      inputTokens: stage1.inputTokens + stage2.inputTokens,
      outputTokens: stage1.outputTokens + stage2.outputTokens,
      latencyMs: stage1.latencyMs + stage2.latencyMs,
      expectedToolRank: rankIndex === -1 ? undefined : rankIndex + 1,
    };
  },
};
