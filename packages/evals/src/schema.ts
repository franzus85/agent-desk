import { z } from "zod";

const fileExistsCheckSchema = z.object({
  type: z.literal("file_exists"),
  path: z.string(),
});

const containsAllCheckSchema = z.object({
  type: z.literal("contains_all"),
  values: z.array(z.string()).min(1),
});

const notContainsCheckSchema = z.object({
  type: z.literal("not_contains"),
  values: z.array(z.string()).min(1),
});

export const outcomeCheckSchema = z.discriminatedUnion("type", [
  fileExistsCheckSchema,
  containsAllCheckSchema,
  notContainsCheckSchema,
]);
export type OutcomeCheck = z.infer<typeof outcomeCheckSchema>;

export const trajectoryExpectationSchema = z.object({
  must_call: z.array(z.string()).default([]),
  must_not_call: z.array(z.string()).default([]),
  max_steps: z.number().int().positive(),
});
export type TrajectoryExpectation = z.infer<typeof trajectoryExpectationSchema>;

export const judgeExpectationSchema = z.object({
  rubric: z.string(),
});
export type JudgeExpectation = z.infer<typeof judgeExpectationSchema>;

export const taskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  fixtures: z.string(),
  // "quick" tasks are the curated PR gate — small and expected to be
  // reliably pass^k; "full" tasks only run in the nightly sweep.
  tier: z.enum(["quick", "full"]).default("quick"),
  expect: z.object({
    outcome: z.array(outcomeCheckSchema).default([]),
    trajectory: trajectoryExpectationSchema,
    judge: judgeExpectationSchema.optional(),
  }),
});
export type Task = z.infer<typeof taskSchema>;
