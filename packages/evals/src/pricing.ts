export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

// $ per million tokens, first-party Anthropic API rates.
const PRICING: Record<string, ModelPricing> = {
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

// Standard Anthropic cache economics: a cache read costs ~10% of a normal
// input token, a cache write (creation) costs ~125%.
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export function costUsd(model: string, usage: RunUsage): number {
  const pricing = PRICING[model];
  if (!pricing) {
    throw new Error(`No pricing configured for model "${model}" — add it to pricing.ts before reporting cost.`);
  }
  const perTokenInput = pricing.inputPerMTok / 1_000_000;
  const perTokenOutput = pricing.outputPerMTok / 1_000_000;
  return (
    usage.inputTokens * perTokenInput +
    usage.outputTokens * perTokenOutput +
    usage.cacheReadInputTokens * perTokenInput * CACHE_READ_MULTIPLIER +
    usage.cacheCreationInputTokens * perTokenInput * CACHE_WRITE_MULTIPLIER
  );
}
