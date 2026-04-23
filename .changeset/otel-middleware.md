---
'@tanstack/ai': minor
---

**OpenTelemetry middleware.** `otelMiddleware({ tracer, meter?, captureContent?, redact?, ... })` emits GenAI-semantic-convention traces and metrics for every `chat()` call.

- Root span per `chat()` + child span per agent-loop iteration + grandchild span per tool call.
- `gen_ai.client.operation.duration` (seconds) and `gen_ai.client.token.usage` (tokens) histograms, recorded per iteration, with the minimal set of low-cardinality attributes.
- `captureContent: true` attaches prompt/completion content as `gen_ai.{user,system,assistant,tool}.message` and `gen_ai.choice` span events, with optional `redact` applied before anything lands on a span. Multimodal parts become placeholder strings.
- Four extension points for custom attributes, names, span-options, and end-of-span callbacks.
- `@opentelemetry/api` is an optional peer dependency; users who don't import the middleware never load OTel.

See `docs/advanced/otel.md` for the full guide.
