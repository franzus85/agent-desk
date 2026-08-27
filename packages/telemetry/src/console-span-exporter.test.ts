import { SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactConsoleSpanExporter } from "./console-span-exporter.js";

function fakeSpan(overrides: Partial<ReadableSpan>): ReadableSpan {
  return {
    name: "span",
    parentSpanContext: undefined,
    spanContext: () => ({ traceId: "abcdef0123456789", spanId: "0123456789abcdef", traceFlags: 1 }),
    duration: [0, 500_000],
    status: { code: SpanStatusCode.OK },
    attributes: {},
    ...overrides,
  } as ReadableSpan;
}

describe("CompactConsoleSpanExporter", () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints one indented line per span, root unindented", () => {
    const exporter = new CompactConsoleSpanExporter();
    exporter.export(
      [
        fakeSpan({ name: "invoke_agent", parentSpanContext: undefined }),
        fakeSpan({ name: "chat claude-haiku-4-5", parentSpanContext: { traceId: "t", spanId: "s", traceFlags: 1 } }),
      ],
      () => {},
    );

    expect(lines[0]?.startsWith("[abcdef01]")).toBe(true);
    expect(lines[0]).toContain("⏱ invoke_agent");
    expect(lines[1]?.startsWith("  [abcdef01]")).toBe(true);
    expect(lines[1]).toContain("⏱ chat claude-haiku-4-5");
  });

  it("shows the first 8 characters of the trace id", () => {
    const exporter = new CompactConsoleSpanExporter();
    exporter.export(
      [fakeSpan({ spanContext: () => ({ traceId: "0123456789abcdef0123456789abcdef", spanId: "s", traceFlags: 1 }) })],
      () => {},
    );

    expect(lines[0]).toContain("[01234567]");
  });

  it("includes gen_ai usage attributes for chat spans", () => {
    const exporter = new CompactConsoleSpanExporter();
    exporter.export(
      [
        fakeSpan({
          name: "chat claude-haiku-4-5",
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.usage.input_tokens": 100,
            "gen_ai.usage.output_tokens": 20,
          },
        }),
      ],
      () => {},
    );

    expect(lines[0]).toContain("in=100 out=20");
  });

  it("marks failed spans with a different symbol and shows the error", () => {
    const exporter = new CompactConsoleSpanExporter();
    exporter.export(
      [fakeSpan({ name: "execute_tool boom", status: { code: SpanStatusCode.ERROR, message: "kaboom" } })],
      () => {},
    );

    expect(lines[0]).toContain("✗");
    expect(lines[0]).toContain("error=kaboom");
  });

  it("truncates long captured tool arguments/results", () => {
    const exporter = new CompactConsoleSpanExporter();
    const longValue = "x".repeat(200);
    exporter.export(
      [
        fakeSpan({
          name: "execute_tool notes.search",
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.call.arguments": longValue,
          },
        }),
      ],
      () => {},
    );

    expect(lines[0]).toContain("…");
    expect(lines[0]?.length).toBeLessThan(longValue.length);
  });
});
