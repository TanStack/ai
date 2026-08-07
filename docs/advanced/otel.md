---
title: OpenTelemetry
id: otel
order: 3
description: "Emit OpenTelemetry traces and GenAI metrics from chat() and media activities via otelMiddleware."
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

If you need OTel traces/metrics on `chat()` (and media activities) → install `@opentelemetry/api`, create a tracer/meter, pass `otelMiddleware`.

Every `chat()` call → root span + one child per provider model call (agent-loop turn **or** structured-output finalization) + one grandchild per tool call. Spans follow [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). Optional `Meter` → GenAI token/duration histograms. Import from `@tanstack/ai/middlewares/otel` so the main package never requires OTel.

**Structured output, no tools:** skips the agent loop; finalization still opens an iteration span (`structuredOutput` phase) so PostHog-style generation backends and `captureContent` work. Native combined mode (`supportsCombinedToolsAndSchema`) does **not** fire that phase — the single `beforeModel` span covers the combined call.

## Setup

1. `pnpm add @opentelemetry/api`
2. Wire your OTel SDK (e.g. `@opentelemetry/sdk-node`)
3. Pass tracer (+ optional meter) into middleware

```ts
import { chat } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { openaiText } from '@tanstack/ai-openai'
import { trace, metrics } from '@opentelemetry/api'

const otel = otelMiddleware({
  tracer: trace.getTracer('my-app'),
  meter: metrics.getMeter('my-app'),
})

const result = await chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [otel],
  stream: false,
})
```

## What gets emitted

### Spans

```text
chat gpt-5.5              (root, kind: INTERNAL)
├── chat gpt-5.5 #0       (iteration, kind: CLIENT)
│   ├── execute_tool get_weather
│   └── execute_tool get_time
└── chat gpt-5.5 #1       (iteration, kind: CLIENT)
```

Iteration spans are numbered (`#0`, `#1`, …) in the order model calls are observed (provider round-trips, not only agent-loop turns).

### Attributes (selected)

| Level | Attribute | Value |
| --- | --- | --- |
| root / iteration | `gen_ai.system` | `openai`, `anthropic`, … |
| iteration | `gen_ai.operation.name` | `chat` |
| root / iteration | `gen_ai.request.model` | requested model |
| iteration | `gen_ai.response.model` | actual model |
| iteration | `gen_ai.request.temperature` / `top_p` / `max_tokens` | from config |
| iteration | `gen_ai.usage.input_tokens` / `output_tokens` | per iteration |
| root / iteration | `gen_ai.usage.total_tokens` / `cost` | when reported |
| root / iteration | `gen_ai.usage.cache_read.input_tokens` / `cache_creation.input_tokens` | when reported |
| root / iteration | `gen_ai.usage.reasoning.output_tokens` | when reported |
| root / iteration | `tanstack.ai.usage.duration_seconds` / `upstream_cost` / splits | when reported |
| iteration | `gen_ai.response.finish_reasons` | e.g. `[stop]`, `[tool_calls]` |
| root | `gen_ai.usage.*` rolled up; `tanstack.ai.iterations` | totals |
| tool | `gen_ai.tool.name` / `call.id` / `type` | tool identity |
| tool | `tanstack.ai.tool.outcome` | `success` / `error` |

Extra usage fields emit only when the provider reports them. Cache/reasoning use GenAI names; cost/total-tokens are de-facto extensions used by backends like PostHog. TanStack-namespaced fields cover duration billing and upstream cost splits.

### Metrics

Requires a `Meter`:

- `gen_ai.client.operation.duration` (seconds) — once per `chat()` call (all iterations + tools). Errors/aborts set `error.type` (error `name`, or `"cancelled"`).
- `gen_ai.client.token.usage` — once per iteration, twice (input + output) with `gen_ai.token.type`.

`gen_ai.response.id` / `gen_ai.response.model` are **not** on metrics (cardinality).

## Privacy: prompts and completions

Default: metadata only. To record content:

```ts
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-app')

otelMiddleware({
  tracer,
  captureContent: true,
  redact: (text) => text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'),
})
```

Events: `gen_ai.user.message`, `gen_ai.system.message`, `gen_ai.assistant.message`, `gen_ai.tool.message`, `gen_ai.choice`.

If `redact` throws → span event gets `"[redaction_failed]"` + warning log — **never** raw content.

Assistant text (`gen_ai.choice`) capped at `maxContentLength` (default 100_000); longer → truncate with `"…"`. Multimodal → placeholders (`[image]`, …). Richer capture: `onSpanEnd`.

Prompt events re-fire from `onConfig` each iteration (full history the adapter re-sends).

## Extension points

All optional; throws become log lines, never break chat.

### spanNameFormatter

```ts
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-app')

otelMiddleware({
  tracer,
  spanNameFormatter: (info) =>
    info.kind === 'tool' ? `tool:${info.toolName}` : `chat:${info.ctx.model}`,
})
```

`info.kind`: `'chat' | 'iteration' | 'tool'` (media: `'generation'`).

### attributeEnricher

```ts
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { trace } from '@opentelemetry/api'
import { getCurrentTenant } from './context'

const tracer = trace.getTracer('my-app')

otelMiddleware({
  tracer,
  attributeEnricher: () => ({
    'tenant.id': getCurrentTenant(),
  }),
})
```

### onBeforeSpanStart / onSpanEnd

`onBeforeSpanStart(info, options)` — mutate `SpanOptions` before `startSpan`.

`onSpanEnd(info, span)` — just before `span.end()`:

```ts
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { trace, metrics } from '@opentelemetry/api'

const tracer = trace.getTracer('my-app')
const meter = metrics.getMeter('my-app')
const toolDuration = meter.createHistogram('tool.duration')

otelMiddleware({
  tracer,
  onSpanEnd: (info, span) => {
    if (info.kind === 'tool') {
      toolDuration.record(1, { 'tool.name': info.toolName })
    }
  },
})
```

## Media activities

Same `otelMiddleware` instance works on `generateImage`, `generateVideo`, `generateAudio`, `generateSpeech`, `generateTranscription`, `summarize` — shared hooks use activity-agnostic `GenerationMiddlewareContext`. One span per call (not a chat tree):

```ts
import { generateImage } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { openaiImage } from '@tanstack/ai-openai'
import { trace, metrics } from '@opentelemetry/api'

const otel = otelMiddleware({
  tracer: trace.getTracer('my-app'),
  meter: metrics.getMeter('my-app'),
})

const result = await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A serene mountain landscape at sunset',
  middleware: [otel],
})
```

| Activity | `gen_ai.operation.name` |
| --- | --- |
| `generateImage` | `image_generation` |
| `generateVideo` | `video_generation` |
| `generateAudio` | `audio_generation` |
| `generateSpeech` | `text_to_speech` |
| `generateTranscription` | `transcription` |
| `summarize` | `summarize` |

Same usage attributes + `tanstack.ai.usage.units_billed` when applicable. Meter records operation duration per activity. Streaming video spans create→poll→complete; non-streaming video opens when the job is accepted and ends on terminal poll. Abandoned streams → `onAbort` (`cancelled`), not a leak.

Custom backends: implement `GenerationMiddleware` (exported from package root). `otelMiddleware` stays on the otel subpath.

## Related

- [Middleware](./middleware) — lifecycle hooks
- [Debug Logging](./debug-logging) — console diagnostics
