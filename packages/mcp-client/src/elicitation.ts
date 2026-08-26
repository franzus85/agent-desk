export interface ElicitationPrompt {
  message: string;
  requestedSchema: unknown;
}

export type ElicitationResponse =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "decline" | "cancel" };

// Pluggable "how do we ask the user" step — a scripted fake in tests, wired
// to a real UI prompt once one exists (Phase 7). Deliberately not built as
// an interactive console prompt here.
export type ElicitationHandler = (prompt: ElicitationPrompt) => Promise<ElicitationResponse>;

export interface InputRequestEntry {
  method: string;
  params: { mode?: string; message: string; requestedSchema: unknown };
}
