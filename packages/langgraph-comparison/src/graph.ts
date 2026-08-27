// Rebuilds Phase 3's winning strategy (progressive disclosure: coarse
// domain index, then a shortlist within it) as a LangGraph JS graph — same
// two-stage shape, plus the pieces the hand-rolled harness doesn't have:
// a durable checkpoint, and a human-in-the-loop interrupt before acting.
// Scoped down from Phase 3's 144-skill synthetic corpus to nine skills
// across three domains on purpose — the comparison here is about graph
// mechanics (state, conditional edges, checkpoints, interrupts), not
// re-running the accuracy benchmark.
import Anthropic from "@anthropic-ai/sdk";
import { Annotation, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";

export const catalog: Record<string, string[]> = {
  crm: ["crm.search_contact", "crm.search_deal", "crm.create_contact"],
  hr: ["hr.search_employee", "hr.request_leave", "hr.search_policy"],
  devops: ["devops.search_incident", "devops.create_ticket", "devops.search_deploy"],
};

export const GraphState = Annotation.Root({
  task: Annotation<string>(),
  domain: Annotation<string>(),
  skillName: Annotation<string>(),
  approved: Annotation<boolean>(),
  attempts: Annotation<number>(),
});

const MAX_ATTEMPTS = 2;

function pickFrom<T extends string>(text: string, options: T[]): T {
  return options.find((option) => text.includes(option)) ?? options[0]!;
}

async function askOneOf(prompt: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 20,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  return textBlock?.text.trim() ?? "";
}

async function selectDomain(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  const domains = Object.keys(catalog);
  const text = await askOneOf(`Task: "${state.task}"\nWhich domain does this belong to: ${domains.join(", ")}?\nReply with exactly one domain name, nothing else.`);
  return { domain: pickFrom(text, domains) };
}

async function selectSkill(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  const skills = catalog[state.domain] ?? [];
  const text = await askOneOf(`Task: "${state.task}"\nWhich skill fits best: ${skills.join(", ")}?\nReply with exactly one skill name, nothing else.`);
  return { skillName: pickFrom(text, skills) };
}

// Human-in-the-loop: pauses here until the graph is re-invoked with
// Command({ resume }) carrying the human's decision. This is the point
// the demo scripts split across two separate process invocations —
// interrupt() throws, unwinding the whole call stack; nothing survives
// that isn't in the checkpoint.
function confirmSelection(state: typeof GraphState.State): Partial<typeof GraphState.State> {
  const decision = interrupt<{ question: string }, { approved: boolean }>({
    question: `Selected "${state.skillName}" (domain "${state.domain}") for task "${state.task}". Approve?`,
  });
  return { approved: decision.approved, attempts: state.attempts + 1 };
}

function finalize(): Partial<typeof GraphState.State> {
  return {};
}

// The conditional edge: approved -> done; rejected with retries left ->
// loop back to re-select; rejected and out of retries -> end unresolved.
function route(state: typeof GraphState.State): "finalize" | "selectDomain" | typeof END {
  if (state.approved) return "finalize";
  if (state.attempts >= MAX_ATTEMPTS) return END;
  return "selectDomain";
}

export function buildGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(GraphState)
    .addNode("selectDomain", selectDomain)
    .addNode("selectSkill", selectSkill)
    .addNode("confirmSelection", confirmSelection)
    .addNode("finalize", finalize)
    .addEdge(START, "selectDomain")
    .addEdge("selectDomain", "selectSkill")
    .addEdge("selectSkill", "confirmSelection")
    .addConditionalEdges("confirmSelection", route, ["finalize", "selectDomain", END])
    .addEdge("finalize", END)
    .compile({ checkpointer });
}
