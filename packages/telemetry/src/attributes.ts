// OpenTelemetry GenAI semantic conventions (open-telemetry/semantic-conventions-genai),
// as they stand in 2026 — note this project's PRD was written against an
// older draft that used "gen_ai.system"; that attribute was renamed to
// gen_ai.provider.name (see docs/PRD.md's Phase 4 callout).
export const GEN_AI_PROVIDER_NAME = "gen_ai.provider.name";
export const GEN_AI_OPERATION_NAME = "gen_ai.operation.name";
export const GEN_AI_REQUEST_MODEL = "gen_ai.request.model";
export const GEN_AI_RESPONSE_MODEL = "gen_ai.response.model";
export const GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens";
export const GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
export const GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS = "gen_ai.usage.cache_read.input_tokens";
export const GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS = "gen_ai.usage.cache_write.input_tokens";
export const GEN_AI_TOOL_NAME = "gen_ai.tool.name";
export const GEN_AI_TOOL_CALL_ID = "gen_ai.tool.call.id";

// Standard OTel span attribute (not GenAI-specific) — the spec's answer to
// this project's originally-planned custom "tool.error_class".
export const ERROR_TYPE = "error.type";

// AgentDesk-specific — not part of the GenAI spec. Phase 3's skill-selection
// telemetry, attached to the model-call span that produced the pick.
export const SKILL_SELECTED = "skill.selected";
export const SKILL_CANDIDATES = "skill.candidates";

export const GEN_AI_PROVIDER_ANTHROPIC = "anthropic";

// gen_ai.operation.name well-known values relevant to this project's spans.
export const GEN_AI_OPERATION_INVOKE_AGENT = "invoke_agent";
export const GEN_AI_OPERATION_CHAT = "chat";
export const GEN_AI_OPERATION_EXECUTE_TOOL = "execute_tool";
