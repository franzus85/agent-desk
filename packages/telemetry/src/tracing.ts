import { trace, type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

let provider: NodeTracerProvider | undefined;

// Console exporter is always on (zero-config, "done when" for Phase 4 is a
// readable trace in the terminal). An OTLP exporter — e.g. to a local
// Phoenix instance — is added only if OTEL_EXPORTER_OTLP_ENDPOINT is set.
export function initTracing(serviceName = "agent-desk"): void {
  if (provider) return;

  const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor(new ConsoleSpanExporter())];

  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (otlpEndpoint) {
    spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })));
  }

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors,
  });
  provider.register();
}

export function getTracer(): Tracer {
  return trace.getTracer("@agent-desk/harness");
}

// BatchSpanProcessor buffers spans and only flushes on its own timer or when
// the batch fills — a short-lived script (dev-run.ts, bench.ts) can exit
// before that ever happens, silently dropping every span it queued for an
// OTLP backend. Call this once the run is done.
export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown();
}
