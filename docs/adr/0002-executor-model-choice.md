# 0002: Executor Model Choice (Opus vs. Haiku)

## Status

Accepted, on a small sample — see Limitations. This is Phase 5's "real experiment": the first end-to-end run of the harness built in Steps 1–7, against the real Anthropic API.

## Context

The PRD names "Opus-only vs. Haiku-router + Opus-executor" as one candidate experiment for Phase 5. As a first pass, this measures the simpler question the router idea depends on: how does `claude-opus-5` (the harness's default executor, adaptive thinking on) compare to `claude-haiku-4-5` (the cheap end of the model lineup) as the *sole* executor on the one committed task, `weekly-report-happy`? N=3 runs per model, real API calls, real notes/calendar MCP servers, judged against `rubrics/status-report.md`.

`claude-haiku-4-5` rejects `thinking: {type: "adaptive"}` outright (400, matching the existing note in `harness/dev-run.ts`), so its runs used `thinking: null`. That's a real difference between the two conditions, not just "same setup, cheaper model" — see Limitations.

Running this for real also caught two bugs the test suite (all mocked clients) never could have:

1. **`judge()` defaulted to `output_config.effort: "low"`**, which `claude-haiku-4-5` (the judge's own default model) rejects — "This model does not support the effort parameter." Fixed by leaving `effort` unset unless the caller opts in, since it only does anything on Opus-tier models anyway.
2. **`RunnerOptions` had no way to pass `thinking: null` through to `runAgent`** — needed the moment the executor model was swapped to Haiku. Added as a passthrough option.

Both are committed as part of this step, ahead of the results below.

## Results

Real API runs, `claude-opus-5` vs. `claude-haiku-4-5`, N=3 each, one task:

| Model | pass@k | pass^k | Pass rate | Mean steps | Mean latency | Mean cost |
|---|---|---|---|---|---|---|
| `claude-opus-5` | true | **false** | 33% (1/3) | 4.33 | 19.8 s | $0.0484 |
| `claude-haiku-4-5` | **false** | false | 0% (0/3) | **0** | 2.3 s | $0.0018 |

Full data: `evals/reports/experiment-model-choice.json`.

### Findings

1. **Neither model hit pass^k.** Even the default executor only succeeded 1 run in 3. This is the headline number to lead with (per the PRD's own framing) over the flattering pass@k — Opus is *capable* of the task, not *reliably* capable of it, at least not yet with the judge's rubric as written.

2. **Haiku's mean steps is exactly 0 — it never once called a tool, across all three runs.** Inspecting a run's raw transcript confirms why: instead of using the available `notes`/`calendar` tools to gather what it needed, it asked the user clarifying questions ("What week is this for? What are your accomplishments?") — questions the tools could answer directly. This isn't a capability gap in the sense of "wrote a worse report" — it never attempted the task at all. That's a materially different failure mode than Opus's (which explored the tools, wrote a report, and sometimes still didn't satisfy the rubric).

3. **The ~27x cost gap (and ~9x latency gap) doesn't actually buy anything here.** Cost-per-successful-run is the number that matters, and Haiku's is undefined (0 successes). A cheaper model that doesn't attempt the task isn't a cheaper way to do the task.

4. **The task prompt itself had a bug, caught by the first real run.** The original prompt didn't say what to title the saved note; the deterministic `file_exists: weekly-report.md` check failed on Opus's first run because it (reasonably) chose its own title (`weekly-status-2026-08-21`). Fixed by making the prompt explicit about the title. A good example of the PRD's own point: outcome checks you can express as code are cheap, but only if the task is specified precisely enough for a compliant response to actually satisfy them.

## Decision

Default to `claude-opus-5` (already the harness default) as the executor for tasks requiring autonomous multi-tool orchestration; do not substitute `claude-haiku-4-5` as a standalone zero-shot executor for this task class — on this sample it didn't attempt the task rather than attempting it cheaply. This doesn't rule out a Haiku-*router* (the PRD's other framing of this candidate, not tested here): routing a request to a narrower, more constrained subtask is a different job than open-ended tool orchestration, and Haiku's lack of adaptive thinking may matter less there.

## Consequences

- No harness defaults change — `claude-opus-5` was already `DEFAULT_MODEL` (loop.ts) and `DEFAULT_EXECUTOR_MODEL` (runner.ts).
- The `RunnerOptions.thinking` passthrough and the judge `effort` fix are now permanent, general-purpose capabilities of the harness, not one-off experiment hacks — any future run with a non-adaptive-thinking model needs both.
- `evals/tasks/weekly-report-happy.yaml`'s prompt is now specific about the output note's title.

## Limitations

- **N=3 runs, one task.** The PRD explicitly says start here and grow (8 tasks × 3 runs next) — these are point estimates, not statistically tight results, and pass^k on N=3 is a coarse instrument.
- **The Haiku condition isn't a clean isolate.** It differs from Opus in both model tier *and* thinking mode (Haiku 4.5 can't do adaptive thinking at all — not a setting, a hard API rejection). The 0/3 result could be about the missing thinking mode, the smaller model, or both; this experiment can't separate them.
- **No per-run diagnostic detail was persisted for the Opus condition.** `experiment-model-choice.json` only holds the aggregate `EvalReport`, not each run's outcome/trajectory/judge breakdown — diagnosing exactly why the 2 failing Opus runs failed required one-off scripts, not committed to the repo. Worth adding to the reporter as a follow-up if more experiments like this are planned.
- **Cost/latency are real numbers from one point in time**, not repeated across sweeps to check the aggregate's own run-to-run stability.
