# 0003: LangGraph Comparison

## Status

Accepted. The PRD calls this "ADR-001" — this project is already at 0002 by the time Phase 9 starts, so it continues the real sequence instead of matching the PRD's placeholder number.

## Context

The JD asks about LangGraph directly, and the honest answer going in was "read about it, never built with it." Phase 9's job is to close that gap with real code, not opinions formed from documentation: rebuild Phase 3's winning strategy (progressive disclosure — a coarse domain index, then a shortlist within it) as a LangGraph JS graph, with the specific mechanics the hand-rolled harness doesn't have — a durable checkpoint and a human-in-the-loop interrupt that survives a process restart.

Scoped down from Phase 3's 144-skill synthetic corpus to 9 skills across 3 domains, on purpose: this comparison is about graph mechanics (state, conditional edges, checkpoints, interrupts), not re-running the accuracy benchmark. `packages/langgraph-comparison` has the graph (`graph.ts`), a custom file-backed checkpointer (`checkpointer.ts`), and two demo scripts (`run-part1.ts`, `run-part2.ts`) that split a single graph run across two genuinely separate process invocations.

## What was built

- **State**: `Annotation.Root({ task, domain, skillName, approved, attempts })` — a plain typed object, not a message list.
- **Nodes**: `selectDomain` and `selectSkill`, each a real `claude-haiku-4-5` call over the small catalog (the same two-stage shape as Phase 3's tier3).
- **Human-in-the-loop interrupt**: `confirmSelection` calls `interrupt({ question })`, which throws and unwinds the graph; the next `.invoke()` with `Command({ resume })` re-enters the node with the human's answer as the interrupt's return value.
- **Conditional edge**: `route(state)` — approved → `finalize`; rejected with attempts left → loop back to `selectDomain`; rejected and out of attempts → `END`. Verified both branches live: an approval reaches `finalize`, and three scripted rejections in a row correctly loop, retry once, then land on `END` and stay there.
- **Checkpointer**: `FileCheckpointSaver` subclasses LangGraph's own `MemorySaver` rather than implementing `BaseCheckpointSaver` from scratch, and persists its `storage`/`writes` maps to a JSON file after every `put`/`putWrites`, rehydrating them in the constructor if the file exists.
- **Restart proof**: `run-part1.ts` runs the graph to the interrupt and exits. `run-part2.ts` — a separate `tsx` invocation, sharing nothing but the file path — constructs a fresh `FileCheckpointSaver`, reads the pending state back (`next: ["confirmSelection"]`), and resumes with `Command({ resume: { approved: true } })` to `finalize`. Both stages ran for real against the API; the transcript is in the commit, not simulated.

## Key decisions

**Subclass `MemorySaver`, don't implement `BaseCheckpointSaver` from scratch.** The abstract contract (`getTuple`/`list`/`put`/`putWrites`/`deleteThread`, channel versions, `versions_seen`) is real complexity, and getting the delta/replay semantics subtly wrong is exactly the kind of bug that only shows up on the second resume. `MemorySaver` already gets that right; the only gap is that it's memory-only. Serializing its own storage maps to disk on every write is a small, low-risk addition on top of already-correct logic — the honest trade is that this proves the checkpoint *interface*, not that a production saver (real SQLite/Postgres, concurrent access, migrations) was built.

**Selection nodes call the Anthropic SDK directly, not through LangGraph's message-array conventions.** There's a whole `MessagesAnnotation`/`addMessages` reducer path in the framework for exactly this, and skipping it here is itself evidence for the ADR's conclusion below — see Consequences.

## Consequences — the defensible opinion

**Where LangGraph earns its cost:** durable state and a resumable interrupt, for real, with almost no code of my own. `compile({ checkpointer })` and `interrupt()`/`Command({ resume })` are the entire mechanism — the harness has nothing like it today. A killed `runAgent` call loses everything; there's no `runId`-keyed resumption point. For anything that needs to survive a crash mid-flight, or pause for a human days later, that's a real, hard-to-replicate capability. The conditional edge is also genuinely nice for explaining a workflow to someone non-technical — `route()` reads like a decision, not like the middle of a `for` loop.

**Where the hand-rolled loop stays better:** full control of context assembly. Phase 4's prompt-caching work depended on exact byte-stability of the request prefix (`tools → system → messages`, no volatile bytes before the cache breakpoint) — that only worked because `loop.ts` builds the `messages` array explicitly, one line I can point at. LangGraph's node functions in this graph call the Anthropic SDK directly rather than adopting the framework's own message-passing state (`MessagesAnnotation`) — which means either giving up some of that fine control to use the framework "as intended," or keeping direct API calls inside nodes and getting checkpointing/interrupts on the *graph's* state while the actual prompt construction stays exactly as hand-rolled as before. Framework indirection in the token-accounting hot path is a real cost, not a hypothetical one — it's the same mechanism Phase 4 spent an amendment on getting right by hand.

**The honest limitation, which is what actually marks having used it**: this is a 2-LLM-node graph with one interrupt. The interesting failure modes — a node with multiple interrupts and side effects before the first one (interrupt() re-runs the whole node from the top on resume; anything before the call re-executes), a real SQLite/Postgres checkpointer under concurrent writers, a graph with actual cycles at scale — weren't hit here, and I'd say so plainly in an interview rather than imply otherwise.

## Done when

Graph runs, survives a process restart via the checkpointer, ADR exists. **— all three met**, restart demonstrated across two real separate process invocations, not simulated in one.
