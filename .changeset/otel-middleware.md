---
'@tanstack/ai': minor
---

**OpenTelemetry middleware.** `otelMiddleware({ tracer, meter?, captureContent?, redact?, ... })` emits GenAI-semantic-convention traces and metrics for every `chat()` call.

- Root span per `chat()` + child span per agent-loop iteration (named `chat <model> #<iteration>`) + grandchild span per tool call.
- `gen_ai.client.operation.duration` (seconds) recorded **once per `chat()` call**; `gen_ai.client.token.usage` (tokens) recorded **per iteration** (one input + one output record). Metric attributes are kept low-cardinality — `gen_ai.response.model` and `gen_ai.response.id` are intentionally excluded.
- `captureContent: true` attaches prompt/completion content as `gen_ai.{user,system,assistant,tool}.message` and `gen_ai.choice` span events. Redactor failures fail closed to a `"[redaction_failed]"` sentinel — raw content never leaks. Assistant text is capped at `maxContentLength` (default 100 000).
- Four extension points for custom attributes, names, span-options, and end-of-span callbacks. Thrown callbacks are caught and logged to `console.warn` with a label so failures remain diagnosable.
- `@opentelemetry/api` is an optional peer dependency. The middleware is exported from the dedicated subpath `@tanstack/ai/middlewares/otel` so that importing `@tanstack/ai/middlewares` does not eagerly require OTel.

See `docs/advanced/otel.md` for the full guide.
