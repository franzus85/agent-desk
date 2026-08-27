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

// One line per span instead of ConsoleSpanExporter's full ReadableSpan dump
// (resource, instrumentationScope, every attribute) — that noise drowns the
// actual agent transcript printed alongside it by renderToConsole.
export class CompactConsoleSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      const indent = span.parentSpanContext ? "  " : "";
      const symbol = span.status.code === SpanStatusCode.ERROR ? "✗" : "⏱";
      const parts = [`${indent}${symbol} ${span.name} · ${formatDuration(span.duration)}`];

      const operation = span.attributes[GEN_AI_OPERATION_NAME];
      if (operation === GEN_AI_OPERATION_CHAT) {
        parts.push(`in=${span.attributes[GEN_AI_USAGE_INPUT_TOKENS]} out=${span.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]}`);
        const cacheRead = span.attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS];
        if (typeof cacheRead === "number" && cacheRead > 0) parts.push(`cache_read=${cacheRead}`);
        const selected = span.attributes[SKILL_SELECTED];
        if (selected !== undefined) parts.push(`selected=${selected}`);
      } else if (operation === GEN_AI_OPERATION_EXECUTE_TOOL) {
        const args = span.attributes[GEN_AI_TOOL_CALL_ARGUMENTS];
        if (args !== undefined) parts.push(`args=${truncate(args)}`);
        const result = span.attributes[GEN_AI_TOOL_CALL_RESULT];
        if (result !== undefined) parts.push(`result=${truncate(result)}`);
      }

      if (span.status.code === SpanStatusCode.ERROR && span.status.message) {
        parts.push(`error=${span.status.message}`);
      }

      console.log(parts.join(" · "));
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {}
}
