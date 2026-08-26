import type Anthropic from "@anthropic-ai/sdk";
import type { SyntheticSkillSpec } from "../generate.js";
import type { SelectionTask } from "../tasks.js";
import { fromApiToolName, PLACEHOLDER_INPUT_SCHEMA, toApiToolName, type SelectionResult, type SelectionStrategy } from "./types.js";

type ToolSearchVariant = "bm25" | "regex";

function searchToolDefinition(variant: ToolSearchVariant): Anthropic.ToolSearchToolBm25_20251119 | Anthropic.ToolSearchToolRegex20251119 {
  return variant === "bm25"
    ? { type: "tool_search_tool_bm25_20251119", name: "tool_search_tool_bm25" }
    : { type: "tool_search_tool_regex_20251119", name: "tool_search_tool_regex" };
}

// All 144 skills are sent every request (the API needs the full definitions
// server-side to index/expand them) but marked defer_loading so only the
// ones Claude actually discovers via search count toward input tokens.
function deferredToolsFromSkills(skills: SyntheticSkillSpec[]): Anthropic.Tool[] {
  return skills.map((skill) => ({
    name: toApiToolName(skill.name),
    description: skill.description,
    input_schema: PLACEHOLDER_INPUT_SCHEMA,
    defer_loading: true,
  }));
}

// A response can contain more than one tool_search_tool_result block if
// Claude searches more than once. Collect every discovered tool across all
// of them, in first-seen order, deduped.
export function discoveredToolNames(content: Anthropic.ContentBlock[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const block of content) {
    if (block.type !== "tool_search_tool_result") continue;
    if (block.content.type !== "tool_search_tool_search_result") continue;
    for (const ref of block.content.tool_references) {
      const name = fromApiToolName(ref.tool_name);
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

type ToolChoiceMode = "any" | "auto";

async function runToolSearch(
  client: Anthropic,
  task: SelectionTask,
  skills: SyntheticSkillSpec[],
  variant: ToolSearchVariant,
  toolChoiceMode: ToolChoiceMode,
): Promise<SelectionResult> {
  const start = performance.now();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [searchToolDefinition(variant), ...deferredToolsFromSkills(skills)],
    tool_choice: { type: toolChoiceMode },
    messages: [{ role: "user", content: task.prompt }],
  });
  const latencyMs = performance.now() - start;

  const discovered = discoveredToolNames(response.content);
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  const rankIndex = discovered.indexOf(task.expectedTool);

  return {
    toolName: toolUse ? fromApiToolName(toolUse.name) : null,
    skillsConsidered: discovered.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    expectedToolRank: rankIndex === -1 ? undefined : rankIndex + 1,
  };
}

// Anthropic's own server-side tool search: all 144 skills are sent deferred,
// Claude searches (BM25 natural-language or regex) and only the discovered
// tools ever enter its context. No client-side filtering logic at all —
// this is what our hand-rolled tiers 1-3 are being compared against.
export const tier4ToolSearchBm25Strategy: SelectionStrategy = {
  name: "tier4-tool-search-bm25",
  select: (client, task, skills) => runToolSearch(client, task, skills, "bm25", "any"),
};

export const tier4ToolSearchRegexStrategy: SelectionStrategy = {
  name: "tier4-tool-search-regex",
  select: (client, task, skills) => runToolSearch(client, task, skills, "regex", "any"),
};

// Same as above but with tool_choice left at "auto" instead of forced "any"
// — testing whether forcing an immediate tool call suppresses the "search
// again with a broader query if the first one came up thin" behavior the
// tool is designed to allow.
export const tier4ToolSearchBm25AutoStrategy: SelectionStrategy = {
  name: "tier4-tool-search-bm25-auto",
  select: (client, task, skills) => runToolSearch(client, task, skills, "bm25", "auto"),
};

export const tier4ToolSearchRegexAutoStrategy: SelectionStrategy = {
  name: "tier4-tool-search-regex-auto",
  select: (client, task, skills) => runToolSearch(client, task, skills, "regex", "auto"),
};
