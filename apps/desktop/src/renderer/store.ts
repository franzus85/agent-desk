import type { AgentEvent } from "@agent-desk/protocol";
import { initialConversationState, markAborted, reduceEvent, type ConversationState } from "@agent-desk/chat-core";

// Keeps the streaming buffer out of React's render path: events queue up
// as they arrive and are reduced in a single batch per animation frame —
// never one setState per token, which is what "melts the UI" on a fast
// stream. React only re-renders when useSyncExternalStore's snapshot
// actually changes, once per frame at most.
export class ConversationStore {
  private state: ConversationState = initialConversationState;
  private pending: AgentEvent[] = [];
  private rafHandle: number | undefined;
  private listeners = new Set<() => void>();

  getSnapshot = (): ConversationState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  push(event: AgentEvent): void {
    // Once aborted, ignore stragglers from the old run until a fresh
    // run.started actually starts a new one.
    if (this.state.status === "aborted" && event.type !== "run.started") return;
    this.pending.push(event);
    this.scheduleFlush();
  }

  abort(): void {
    this.pending = [];
    this.state = markAborted(this.state);
    this.notify();
  }

  private scheduleFlush(): void {
    if (this.rafHandle !== undefined) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = undefined;
      this.flush();
    });
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    let next = this.state;
    for (const event of this.pending) next = reduceEvent(next, event);
    this.pending = [];
    this.state = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
