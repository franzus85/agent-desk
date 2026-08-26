import { trace, type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let initialized = false;

// Console exporter is always on (zero-config, "done when" for Phase 4 is a
// readable trace in the terminal). An OTLP exporter — e.g. to a local
// Phoenix instance — is added only if OTEL_EXPORTER_OTLP_ENDPOINT is set.
export function initTracing(serviceName = "agent-desk"): void {
  if (initialized) return;
  initialized = true;

  const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor(new ConsoleSpanExporter())];

  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (otlpEndpoint) {
    spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })));
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors,
  });
  provider.register();
}

export function getTracer(): Tracer {
  return trace.getTracer("@agent-desk/harness");
}
