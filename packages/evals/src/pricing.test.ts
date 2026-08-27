import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing.js";

describe("costUsd", () => {
  it("prices plain input and output tokens at the model's per-MTok rate", () => {
    const cost = costUsd("claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(cost).toBeCloseTo(1 + 5, 10);
  });

  it("discounts cache reads to 10% and marks up cache writes to 125% of the input rate", () => {
    const cost = costUsd("claude-haiku-4-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1 * 0.1 + 1 * 1.25, 10);
  });

  it("throws for a model with no configured pricing, instead of silently reporting $0", () => {
    expect(() =>
      costUsd("claude-made-up-9000", { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }),
    ).toThrow(/No pricing configured/);
  });
});
