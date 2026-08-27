import type { AgentEvent } from "@agent-desk/protocol";

export interface TextItem {
  type: "text";
  id: string;
  text: string;
  done: boolean;
}

export interface ToolCallItem {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
  status: "running" | "done" | "failed";
  result?: unknown;
  error?: string;
  durationMs?: number;
}

// Chronological, renderable timeline — this is the whole point of the
// reducer: turn a flat AgentEvent stream into "what happened, in order",
// which is exactly what tool-call-timeline explainability needs.
export type TimelineItem = TextItem | ToolCallItem;

export type ConversationStatus = "idle" | "running" | "done" | "error" | "aborted";

export interface ConversationState {
  items: TimelineItem[];
  status: ConversationStatus;
  errorMessage?: string;
}

export const initialConversationState: ConversationState = {
  items: [],
  status: "idle",
};

function closeOpenText(items: TimelineItem[]): TimelineItem[] {
  const last = items[items.length - 1];
  if (last && last.type === "text" && !last.done) {
    return [...items.slice(0, -1), { ...last, done: true }];
  }
  return items;
}

// Pure: protocol events in, renderable state out. No React, no I/O — fully
// testable by replaying a recorded (or synthetic) AgentEvent[] trace.
export function reduceEvent(state: ConversationState, event: AgentEvent): ConversationState {
  switch (event.type) {
    case "run.started":
      return { items: [], status: "running" };

    case "text.delta": {
      const items = state.items.slice();
      const last = items[items.length - 1];
      if (last && last.type === "text" && !last.done) {
        items[items.length - 1] = { ...last, text: last.text + event.delta };
      } else {
        // A new text segment starts whenever the previous item wasn't an
        // open text item — i.e. right after a tool call's results came back.
        items.push({ type: "text", id: `text-${items.length}`, text: event.delta, done: false });
      }
      return { ...state, items };
    }

    case "tool.started": {
      const items = closeOpenText(state.items);
      items.push({ type: "tool_call", id: event.toolCallId, name: event.name, input: event.input, status: "running" });
      return { ...state, items };
    }

    case "tool.finished":
      return {
        ...state,
        items: state.items.map((item) =>
          item.type === "tool_call" && item.id === event.toolCallId
            ? { ...item, status: "done" as const, result: event.result, durationMs: event.durationMs }
            : item,
        ),
      };

    case "tool.failed":
      return {
        ...state,
        items: state.items.map((item) =>
          item.type === "tool_call" && item.id === event.toolCallId
            ? { ...item, status: "failed" as const, error: event.error }
            : item,
        ),
      };

    case "run.finished":
      return { ...state, items: closeOpenText(state.items), status: "done" };

    case "run.error":
      return { ...state, items: closeOpenText(state.items), status: "error", errorMessage: event.message };

    default:
      return state;
  }
}

// Cancel: stop where we are, keep everything rendered so far, close any
// in-progress text segment rather than leaving it visually "hanging".
// A follow-up turn can build on this state (it's not cleared).
export function markAborted(state: ConversationState): ConversationState {
  if (state.status !== "running") return state;
  return { ...state, items: closeOpenText(state.items), status: "aborted" };
}
