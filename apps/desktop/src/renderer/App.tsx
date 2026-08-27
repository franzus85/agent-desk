import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseMarkdownBlocks } from "@agent-desk/chat-core";
import type { TextItem, TimelineItem, ToolCallItem } from "@agent-desk/chat-core";
import { ConversationStore } from "./store.js";

const store = new ConversationStore();

function TextBlock({ item }: { item: TextItem }): React.JSX.Element {
  const blocks = parseMarkdownBlocks(item.text);
  return (
    <div className="msg-text">
      {blocks.map((block, i) =>
        block.type === "code" ? (
          <pre key={i} className={block.closed ? "code" : "code code-open"}>
            <code>{block.code}</code>
          </pre>
        ) : (
          <p key={i}>{block.text}</p>
        ),
      )}
    </div>
  );
}

// Memoized on purpose: once a tool call is done/failed its props stop
// changing, and it should never re-render again — only the one item still
// streaming (a TextItem with done:false) re-renders per animation frame.
const ToolCallCard = memo(function ToolCallCard({ item }: { item: ToolCallItem }): React.JSX.Element {
  return (
    <div className={`tool-card tool-${item.status}`}>
      <div className="tool-head">
        <span className="tool-name">{item.name}</span>
        <span className="tool-status">{item.status}</span>
      </div>
      <details>
        <summary>input</summary>
        <pre>{JSON.stringify(item.input, null, 2)}</pre>
      </details>
      {item.status === "done" && (
        <details>
          <summary>result{item.durationMs !== undefined ? ` · ${item.durationMs}ms` : ""}</summary>
          <pre>{JSON.stringify(item.result, null, 2)}</pre>
        </details>
      )}
      {item.status === "failed" && <div className="tool-error">{item.error}</div>}
    </div>
  );
});

const TimelineRow = memo(function TimelineRow({ item }: { item: TimelineItem }): React.JSX.Element {
  return item.type === "text" ? <TextBlock item={item} /> : <ToolCallCard item={item} />;
});

export function App(): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [prompt, setPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick-to-bottom while the user hasn't scrolled up; release it the
  // moment they do, so a fast stream never yanks their scroll position.
  const stickToBottom = useRef(true);

  useEffect(() => window.agentDesk.onAgentEvent((event) => store.push(event)), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const running = state.status === "running";

  const run = useCallback(() => {
    if (!prompt.trim() || running) return;
    stickToBottom.current = true;
    setPrompt("");
    void window.agentDesk.startRun(prompt);
  }, [prompt, running]);

  const cancel = useCallback(() => {
    void window.agentDesk.cancelRun();
    store.abort();
  }, []);

  const liveMessage =
    state.status === "running"
      ? "Agent is responding"
      : state.status === "done"
        ? "Response complete"
        : state.status === "aborted"
          ? "Run cancelled"
          : state.status === "error"
            ? `Run failed: ${state.errorMessage ?? ""}`
            : "";

  return (
    <div className="app">
      <div className="conversation" id="conversation" ref={scrollRef} onScroll={handleScroll}>
        {state.items.length === 0 && state.status === "idle" && (
          <p className="empty-hint">Ask it to do something with your notes and calendar.</p>
        )}
        {state.items.map((item) => (
          <TimelineRow key={item.id} item={item} />
        ))}
        {state.status === "error" && <div className="run-error">Run error: {state.errorMessage}</div>}
      </div>

      <div aria-live="polite" className="sr-only" id="live-region">
        {liveMessage}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Write my weekly status report…"
          disabled={running}
          aria-label="Message"
        />
        {running ? (
          <button type="button" id="cancel-run" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button type="submit" id="run" disabled={!prompt.trim()}>
            Run
          </button>
        )}
      </form>
    </div>
  );
}
