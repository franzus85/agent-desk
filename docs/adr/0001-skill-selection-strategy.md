# 0001: Skill Selection Strategy at Scale

## Status

Accepted (as a recommendation for future harness integration — not yet wired into the agent loop; Phase 3 was a benchmark, not an integration).

## Context

AgentDesk's harness can register skills as tools, but every prior phase assumed a handful of them. Real deployments (and the SAP Joule interview gap this project exists to close) need an opinion on what happens once that number reaches the hundreds: dumping every tool definition into every request doesn't scale in tokens, latency, or model accuracy.

To measure this instead of guessing, `packages/skills/src/synthetic/` generates a 144-skill synthetic corpus: 12 plausible SaaS domains (CRM, HR, DevOps, Expenses, ...) × 3 objects each × 4 verbs (search/list/get/create), with names deliberately colliding across domains (36 tools all named `*.search_*`). A hand-curated 24-task set (`tasks.ts`) pairs each task with a ground-truth tool, split evenly:

- **easy** — the prompt names the object literally ("Find the contact named Jane Doe" → `crm.search_contact`)
- **hard** — the prompt paraphrases it ("What's the status of the Acme opportunity?" → `crm.search_deal`, without the word "deal")

Six strategies were benchmarked against the same task set, model (`claude-haiku-4-5`), and scoring (exact tool-name match):

| Strategy | Mechanism |
|---|---|
| `naive` | Every skill in `tools`, unfiltered |
| `tier1-keyword` | Deterministic token-overlap filter, top 10, no model call |
| `tier2-embedding` | Voyage (`voyage-4-lite`) cosine-similarity retrieval, top 10 |
| `tier3-progressive` | Two Haiku calls: pick a domain from a 12-item index, then pick a skill from that domain's 12 |
| `tier4-tool-search-bm25` | Anthropic's built-in `tool_search_tool_bm25_20251119`, all skills `defer_loading: true` |
| `tier4-tool-search-regex` | Same, `tool_search_tool_regex_20251119` |

## Results

Real API runs, 24 tasks each, Haiku 4.5 pricing ($1.00 / $5.00 per MTok input/output):

| Strategy | Accuracy (easy / hard) | Avg. candidates | Avg. input tokens | Avg. latency | Est. cost/task |
|---|---|---|---|---|---|
| naive | 67% (100% / 33%) | 144 | 8,183 | 966 ms | $0.0084 |
| tier1-keyword | 54% (100% / 8%) | 10 | 1,133 | 837 ms | $0.0013 |
| tier2-embedding | 54% (92% / 17%) | 10 | 1,133 | 839 ms | $0.0014 |
| **tier3-progressive** | **67% (100% / 33%)** | 12 | 2,481 | 1,796 ms | $0.0030 |
| tier4-tool-search-bm25 | 17% (25% / 8%) | 3.0 | 2,127 | 2,809 ms | $0.0032 |
| tier4-tool-search-regex | 21% (17% / 25%) | 1.5 | 1,960 | 2,971 ms | $0.0030 |

Full per-task data: `packages/skills/bench-reports/*.json` (gitignored — regenerate with `pnpm --filter @agent-desk/skills bench`).

### Findings

1. **Naive is accurate but token-expensive.** 8.2k input tokens/call before any real work happens — the exact "context bloat" problem tool-scaling techniques exist to solve.

2. **Keyword filtering (tier1) cuts tokens 86% but breaks on paraphrase.** Easy accuracy holds at 100% (literal words still match); hard accuracy collapses 33%→8%. `avgExpectedToolRank` of 33 (only top-10 survive) confirms the correct tool is usually filtered out before the model ever sees it — the intended, engineered failure mode.

3. **Embeddings (tier2) fix recall but not accuracy.** Semantic retrieval roughly halves recall failures (9→4 of 12 hard tasks) and drops the correct tool's average rank from 33 to 5.2 — real, measurable retrieval improvement. But overall accuracy barely moves (54% either way), and hard accuracy only ticks up to 17%. **Recall and final selection are separate bottlenecks**: getting the right tool into the candidate pool doesn't mean Haiku picks it once several semantically-similar options are in front of it.

4. **Progressive disclosure (tier3) is the standout trade-off.** Two cheap sequential calls (coarse domain index → full detail for the winner) match naive's accuracy exactly at ~30% of its token cost, with zero recall failures — domain-level routing is coarse enough to be robust even on paraphrased prompts. Cost: roughly 2x the latency of a single call.

5. **Anthropic's built-in tool search (tier4) underperforms on this corpus specifically.** Both variants land at 17-21% accuracy — worse than every hand-rolled tier, including the naive baseline. `avgSkillsConsidered` is only 1.5-3.0: a single BM25/regex query recalls very few candidates. When the right tool *is* found, its rank is excellent (1.5-2.3) — so this isn't a ranking problem, it's a recall problem. A follow-up test with `tool_choice: "auto"` instead of forced `"any"` produced near-identical numbers, ruling out "forced immediate call suppresses re-search" as the cause. The more likely explanation: BM25 and regex are both keyword-based mechanisms, and this corpus is deliberately built to defeat literal keyword matching on its hard half — the same weakness tier1 has, but without tier1's guaranteed top-10 floor. Built-in tool search is very likely tuned for large, *vocabulary-diverse* real toolsets (many distinct MCP servers with genuinely different vocabularies), not an adversarially collision-engineered synthetic benchmark like this one.

## Decision

Default to **progressive disclosure (tier3-style)** once a skill library exceeds roughly 10-20 entries: a lightweight category/domain index first, full tool definitions loaded only for the branch the model selects. It measured the best accuracy-per-token of every strategy tested and matches how skills are meant to be authored in the first place (one self-contained instructions file per capability, loaded on demand — see `packages/skills/src/schema.ts`).

Do not default to naive beyond a small, fixed tool count — token cost scales linearly with skill count for no accuracy benefit over tier3. Do not rely on a flat top-K filter (tier1/tier2) alone as the sole selection mechanism — both show the same hard-task cliff; embeddings are worth keeping as the *filtering* mechanism inside a progressive approach (e.g., using similarity instead of an LLM call to pick the coarse category) rather than as a standalone strategy. Do not assume Anthropic's built-in tool search is a drop-in win — evaluate it against your actual tool vocabulary before adopting it; it did not help here.

## Consequences

- AgentDesk's harness does not yet wire any of this into the agent loop — `ToolRegistry` still registers everything flat. Adding a selection layer in front of it is future work, out of Phase 3's scope.
- The synthetic corpus and task set are reusable for evaluating any future strategy (e.g. a hybrid embedding-prefilter + progressive-disclosure approach) against the same six numbers.

## Limitations

- N=24 tasks, single run per strategy, no repeated trials — Haiku's own sampling noise is visible in the data (naive's accuracy moved 67%→71%→67% across separate runs of the same code). These are point estimates, not statistically tight results.
- The corpus is deliberately adversarial (dense name collision by design). Real tool catalogs are usually less confusable, so tier4's built-in search would likely score higher outside this specific benchmark.
- Tier3's win depends on a clean two-level domain/object hierarchy. Real skill libraries may not decompose this neatly, which would weaken tier3's advantage.
