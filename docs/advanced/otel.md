---
title: OpenTelemetry
id: otel
order: 4
description: "Emit vendor-neutral OpenTelemetry traces and metrics from every TanStack AI chat() call, following the OTel GenAI semantic conventions."
keywords:
  - tanstack ai
  - opentelemetry
  - otel
  - observability
  - tracing
  - metrics
  - gen_ai
  - semantic conventions
---

The `otelMiddleware` factory wires TanStack AI into your existing OpenTelemetry setup. Every `chat()` call produces a root span, one child span per agent-loop iteration, and one grandchild span per tool call — all with [GenAI semantic-convention attributes](https://opentelemetry.io/docs/specs/semconv/gen-ai/). It also records GenAI token and duration histograms when a `Meter` is provided.

## Setup

Install `@opentelemetry/api` — it's an optional peer dependency of `@tanstack/ai`:

```
pnpm add @opentelemetry/api
```

Wire up your OTel SDK however you already do (e.g. `@opentelemetry/sdk-node`). Then pass a `Tracer` (and optionally a `Meter`) into the middleware:

```ts
import { chat } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { trace, metrics } from '@opentelemetry/api'

const otel = otelMiddleware({
  tracer: trace.getTracer('my-app'),
  meter: metrics.getMeter('my-app'),
})

const result = await chat({
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [otel],
  stream: false,
})
```

## What gets emitted

### Spans

```
chat gpt-4o           (root, kind: INTERNAL)
├── chat gpt-4o       (iteration, kind: CLIENT)
│   └── execute_tool get_weather
│   └── execute_tool get_time
└── chat gpt-4o       (iteration, kind: CLIENT)
```

### Attribute reference

| Level | Attribute | Value |
| --- | --- | --- |
| root / iteration | `gen_ai.system` | `openai`, `anthropic`, ... |
| root / iteration | `gen_ai.operation.name` | `chat` |
| root / iteration | `gen_ai.request.model` | requested model |
| iteration | `gen_ai.response.model` | actual model |
| iteration | `gen_ai.request.temperature` | from config |
| iteration | `gen_ai.request.top_p` | from config |
| iteration | `gen_ai.request.max_tokens` | from config |
| iteration | `gen_ai.usage.input_tokens` | per iteration |
| iteration | `gen_ai.usage.output_tokens` | per iteration |
| iteration | `gen_ai.response.finish_reasons` | `[stop]`, `[tool_calls]`, ... |
| root | `gen_ai.usage.input_tokens` | rolled up |
| root | `gen_ai.usage.output_tokens` | rolled up |
| root | `tanstack.ai.iterations` | iteration count |
| tool | `gen_ai.tool.name` | tool name |
| tool | `gen_ai.tool.call.id` | tool call id |
| tool | `gen_ai.tool.type` | `function` |
| tool | `tanstack.ai.tool.outcome` | `success` / `error` |

### Metrics

Two GenAI-standard histograms, recorded per iteration:

- `gen_ai.client.operation.duration` (seconds) — per-iteration duration
- `gen_ai.client.token.usage` (tokens) — recorded twice per iteration (input + output) with `gen_ai.token.type` attribute

`gen_ai.response.id` is deliberately excluded from metric attributes to keep cardinality low.

## Privacy: capturing prompts and completions

By default, only metadata lands on spans. To record prompt and completion content, set `captureContent: true`. Content is captured as OTel span events following the GenAI convention:

- `gen_ai.user.message`, `gen_ai.system.message`, `gen_ai.assistant.message`, `gen_ai.tool.message`, `gen_ai.choice`

Pass a `redact` function to strip PII before anything is recorded:

```ts
otelMiddleware({
  tracer,
  captureContent: true,
  redact: (text) => text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'),
})
```

Multimodal content (images, audio, video, documents) is represented as placeholder strings (`[image]`, `[audio]`, ...) to preserve message order without dumping binary data onto spans. Use `onSpanEnd` if you need richer multimodal capture.

## Extension points

All four extensions are optional. Each wraps user code in try/catch — a thrown callback becomes a log line, never a broken chat.

### `spanNameFormatter(info)`

Override default span names. `info.kind` is `'chat' | 'iteration' | 'tool'`.

```ts
otelMiddleware({
  tracer,
  spanNameFormatter: (info) =>
    info.kind === 'tool' ? `tool:${info.toolName}` : `chat:${info.ctx.model}`,
})
```

### `attributeEnricher(info)`

Add custom attributes to every span. Fires once per span.

```ts
otelMiddleware({
  tracer,
  attributeEnricher: () => ({
    'tenant.id': getCurrentTenant(),
  }),
})
```

### `onBeforeSpanStart(info, options)`

Mutate `SpanOptions` immediately before `tracer.startSpan(...)`. Useful for adding links, custom start times, or extra default attributes.

### `onSpanEnd(info, span)`

Fires just before every `span.end()`. Common uses: record custom events, emit per-tool metrics via your own `Meter`.

```ts
const toolDuration = meter.createHistogram('tool.duration')
otelMiddleware({
  tracer,
  onSpanEnd: (info, span) => {
    if (info.kind === 'tool') {
      // span is still recording; read timestamps from your own store if needed
      toolDuration.record(1, { 'tool.name': info.toolName })
    }
  },
})
```

## Related

- [Middleware](./middleware) — the lifecycle this middleware hooks into
- [Debug Logging](./debug-logging) — quick console-output diagnostics, complementary to OTel
- [Observability](./observability) — TanStack AI's built-in event client
