import { z } from "zod";

const envelope = {
  runId: z.string(),
  ts: z.number(),
};

const runStarted = z.object({
  type: z.literal("run.started"),
  ...envelope,
  task: z.string(),
});

const usage = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
});

const runFinished = z.object({
  type: z.literal("run.finished"),
  ...envelope,
  stopReason: z.enum(["end_turn", "turn_budget", "repeat_detected", "pause_turn"]),
  // Cumulative across every turn of the run — absent from events emitted
  // before this field existed. Lets a consumer (e.g. an eval runner) report
  // mean cost per task without standing up its own OTel exporter.
  usage: usage.optional(),
});

const runError = z.object({
  type: z.literal("run.error"),
  ...envelope,
  message: z.string(),
});

const textDelta = z.object({
  type: z.literal("text.delta"),
  ...envelope,
  delta: z.string(),
});

const toolSelected = z.object({
  type: z.literal("tool.selected"),
  ...envelope,
  candidates: z.array(z.string()),
  chosen: z.string(),
});

const toolStarted = z.object({
  type: z.literal("tool.started"),
  ...envelope,
  toolCallId: z.string(),
  name: z.string(),
  input: z.unknown(),
});

const toolFinished = z.object({
  type: z.literal("tool.finished"),
  ...envelope,
  toolCallId: z.string(),
  name: z.string(),
  result: z.unknown(),
  durationMs: z.number(),
});

const toolFailed = z.object({
  type: z.literal("tool.failed"),
  ...envelope,
  toolCallId: z.string(),
  name: z.string(),
  error: z.string(),
});

const permissionRequested = z.object({
  type: z.literal("permission.requested"),
  ...envelope,
  toolCallId: z.string(),
  summary: z.string(),
});

const permissionResolved = z.object({
  type: z.literal("permission.resolved"),
  ...envelope,
  toolCallId: z.string(),
  decision: z.enum(["approved", "denied"]),
});

const skillLoaded = z.object({
  type: z.literal("skill.loaded"),
  ...envelope,
  name: z.string(),
});

export const AgentEvent = z.discriminatedUnion("type", [
  runStarted,
  runFinished,
  runError,
  textDelta,
  toolSelected,
  toolStarted,
  toolFinished,
  toolFailed,
  permissionRequested,
  permissionResolved,
  skillLoaded,
]);

export type AgentEvent = z.infer<typeof AgentEvent>;
