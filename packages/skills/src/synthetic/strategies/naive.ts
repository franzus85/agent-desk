import { selectFromCandidates, type SelectionStrategy } from "./types.js";

// Baseline: every skill goes into the tools array, unfiltered. This is what
// "just give the model everything" costs in tokens/latency/accuracy as the
// skill count grows — the number every filtering/retrieval strategy has to
// beat.
export const naiveStrategy: SelectionStrategy = {
  name: "naive",
  select: (client, task, skills) => selectFromCandidates(client, task, skills),
};
