import { styleText } from "node:util";
import { SpanStatusCode } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  GEN_AI_OPERATION_CHAT,
  GEN_AI_OPERATION_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SKILL_SELECTED,
} from "./attributes.js";

function formatDuration([seconds, nanos]: [number, number]): string {
  const ms = seconds * 1000 + nanos / 1e6;
  if (ms < 1) return `${Math.round(ms * 1000)}µs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function truncate(value: unknown, max = 80): string {
  const text = typeof value === "string" ? value : String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// styleText no-ops (returns plain text) when stdout isn't a TTY, so this is
// safe to always call — piping/redirecting output never leaks escape codes.
function color(format: Parameters<typeof styleText>[0], text: string): string {
  return styleText(format, text);
}

// One line per span instead of ConsoleSpanExporter's full ReadableSpan dump
// (resource, instrumentationScope, every attribute) — that noise drowns the
// actual agent transcript printed alongside it by renderToConsole.
export class CompactConsoleSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      const isRoot = !span.parentSpanContext;
      const indent = isRoot ? "" : "  ";
      const isError = span.status.code === SpanStatusCode.ERROR;
      const symbol = isError ? "✗" : "⏱";

      // Full id on the root span (invoke_agent) — that's the one worth
      // copy-pasting into Phoenix/Grafana's trace search. Children reuse the
      // short form so lines stay scannable.
      const fullTraceId = span.spanContext().traceId;
      const traceId = color("gray", `[${isRoot ? fullTraceId : fullTraceId.slice(0, 8)}]`);
      const head = color(isError ? "red" : "green", `${symbol} ${span.name}`);
      const duration = color("yellow", formatDuration(span.duration));
      const parts = [`${indent}${traceId} ${head} · ${duration}`];

      const details: string[] = [];
      const operation = span.attributes[GEN_AI_OPERATION_NAME];
      if (operation === GEN_AI_OPERATION_CHAT) {
        details.push(`in=${span.attributes[GEN_AI_USAGE_INPUT_TOKENS]} out=${span.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]}`);
        const cacheRead = span.attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS];
        if (typeof cacheRead === "number" && cacheRead > 0) details.push(`cache_read=${cacheRead}`);
        const selected = span.attributes[SKILL_SELECTED];
        if (selected !== undefined) details.push(`selected=${selected}`);
      } else if (operation === GEN_AI_OPERATION_EXECUTE_TOOL) {
        const args = span.attributes[GEN_AI_TOOL_CALL_ARGUMENTS];
        if (args !== undefined) details.push(`args=${truncate(args)}`);
        const result = span.attributes[GEN_AI_TOOL_CALL_RESULT];
        if (result !== undefined) details.push(`result=${truncate(result)}`);
      }
      if (isError && span.status.message) details.push(`error=${span.status.message}`);

      if (details.length > 0) {
        parts.push(color("gray", details.join(" · ")));
      }

      console.log(parts.join(" · "));
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {}
}
