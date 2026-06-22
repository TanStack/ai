---
title: OpenTelemetry
id: otel
order: 3
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

```bash
pnpm add @opentelemetry/api
```

Wire up your OTel SDK however you already do (e.g. `@opentelemetry/sdk-node`). Then pass a `Tracer` (and optionally a `Meter`) into the middleware. The OTel middleware lives on its own subpath — importing it never affects users who don't need OTel:

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
  adapter: openaiText('gpt-4o'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [otel],
  stream: false,
})
```

## What gets emitted

### Spans

```text
chat gpt-4o              (root, kind: INTERNAL)
├── chat gpt-4o #0       (iteration, kind: CLIENT)
│   ├── execute_tool get_weather
│   └── execute_tool get_time
└── chat gpt-4o #1       (iteration, kind: CLIENT)
```

Iteration spans are numbered (`#0`, `#1`, ...) so distinct iterations of the same chat are easy to pick apart in trace viewers.

### Attribute reference

| Level | Attribute | Value |
| --- | --- | --- |
| root / iteration | `gen_ai.system` | `openai`, `anthropic`, ... |
| iteration | `gen_ai.operation.name` | `chat` |
| root / iteration | `gen_ai.request.model` | requested model |
| iteration | `gen_ai.response.model` | actual model |
| iteration | `gen_ai.request.temperature` | from config |
| iteration | `gen_ai.request.top_p` | from config |
| iteration | `gen_ai.request.max_tokens` | from config |
| iteration | `gen_ai.usage.input_tokens` | per iteration |
| iteration | `gen_ai.usage.output_tokens` | per iteration |
| root / iteration | `gen_ai.usage.total_tokens` | provider-reported total |
| root / iteration | `gen_ai.usage.cost` | provider-reported cost, when available |
| root / iteration | `gen_ai.usage.cache_read.input_tokens` | cached prompt tokens, when reported |
| root / iteration | `gen_ai.usage.cache_creation.input_tokens` | cache-write prompt tokens, when reported |
| root / iteration | `gen_ai.usage.reasoning.output_tokens` | reasoning/thinking tokens, when reported |
| root / iteration | `tanstack.ai.usage.duration_seconds` | duration-based billing (e.g. transcription), when reported |
| root / iteration | `tanstack.ai.usage.upstream_cost` | gateway upstream cost (e.g. OpenRouter), when reported |
| root / iteration | `tanstack.ai.usage.upstream_input_cost` | upstream input cost split, when reported |
| root / iteration | `tanstack.ai.usage.upstream_output_cost` | upstream output cost split, when reported |
| iteration | `gen_ai.response.finish_reasons` | `[stop]`, `[tool_calls]`, ... |
| root | `gen_ai.usage.input_tokens` | rolled up |
| root | `gen_ai.usage.output_tokens` | rolled up |
| root | `tanstack.ai.iterations` | iteration count |
| tool | `gen_ai.tool.name` | tool name |
| tool | `gen_ai.tool.call.id` | tool call id |
| tool | `gen_ai.tool.type` | `function` |
| tool | `tanstack.ai.tool.outcome` | `success` / `error` |

Usage attributes beyond input/output tokens are emitted only when the provider reports them, so spans stay clean otherwise. Cache and reasoning breakdowns use the official GenAI semconv names; `gen_ai.usage.cost` and `gen_ai.usage.total_tokens` are de-facto extensions consumed directly by backends like PostHog — without them, backends re-derive cost from their own price tables and lose cache discounts and gateway markup. Fields with no established convention (duration-based billing, the upstream cost split) are TanStack-namespaced.

### Metrics

Two GenAI-standard histograms:

- `gen_ai.client.operation.duration` (seconds) — recorded **once per `chat()` call**, covering all agent-loop iterations and tool execution. On error or abort the record carries an `error.type` attribute (the thrown error's `name`, or `"cancelled"` for aborts).
- `gen_ai.client.token.usage` (tokens) — recorded **once per iteration** (two records: input and output), tagged with `gen_ai.token.type`.

Both `gen_ai.response.id` and `gen_ai.response.model` are deliberately excluded from metric attributes to keep cardinality low (per-request custom-model names and request IDs would blow up the series set).

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

If `redact` throws, the middleware writes the literal sentinel `"[redaction_failed]"` into the span event and logs a warning — it never falls back to the raw content. This is the load-bearing invariant for users who ship traces to third-party backends: a broken redactor should shut off capture, not leak prompts.

Accumulated assistant text (the `gen_ai.choice` event) is capped at `maxContentLength` characters (default `100 000`); longer completions are truncated with a trailing `"…"` marker.

Multimodal content (images, audio, video, documents) is represented as placeholder strings (`[image]`, `[audio]`, ...) to preserve message order without dumping binary data onto spans. Use `onSpanEnd` if you need richer multimodal capture.

Prompt/system/user message events fire from `onConfig` at the start of every iteration, which means the full conversation history (as the adapter will re-send it) is re-emitted on each iteration span. This mirrors what the provider actually sees on the wire.

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

## Beyond chat: media activities

`otelMiddleware` is not chat-only. The media activities — `generateImage`, `generateVideo`, `generateAudio`, `generateSpeech`, and `generateTranscription` — accept the **same** `otelMiddleware` value on their `middleware` option. Each is a single request → response (or submit → poll for video), so the middleware emits one span per call instead of the chat span tree:

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

The same `otel` value can be passed to `chat()` and to any media activity — its shared lifecycle hooks (`onStart` / `onUsage` / `onFinish` / `onAbort` / `onError`) are authored against the activity-agnostic `GenerationMiddlewareContext`, so the one instance works everywhere.

Each media call produces one `CLIENT` span tagged with the activity's `gen_ai.operation.name`:

| Activity | `gen_ai.operation.name` |
| --- | --- |
| `generateImage` | `image_generation` |
| `generateVideo` | `video_generation` |
| `generateAudio` | `audio_generation` |
| `generateSpeech` | `text_to_speech` |
| `generateTranscription` | `transcription` |

The span carries `gen_ai.system` and `gen_ai.request.model` at start and, on finish, the same `gen_ai.usage.*` / `tanstack.ai.usage.*` attributes documented above — including `tanstack.ai.usage.units_billed` for unit-billed media. When a `Meter` is supplied it records the `gen_ai.client.operation.duration` histogram, tagged per activity. For streaming video the span covers the full create → poll → complete lifecycle; for non-streaming `generateVideo` it covers job submission. If a streaming video consumer abandons the stream before completion, the span is ended via `onAbort` (status `ERROR`, `tanstack.ai.completion.reason = cancelled`) rather than leaked.

`otelMiddleware` applies the same `spanNameFormatter`, `attributeEnricher`, `onBeforeSpanStart`, and `onSpanEnd` extension points to media spans — the span info is discriminated by `kind`, where media spans report `kind: 'generation'`. For a custom backend, implement the base `GenerationMiddleware` contract directly; its hooks (`onStart` / `onUsage` / `onFinish` / `onAbort` / `onError`) receive the `GenerationMiddlewareContext` and fire for every activity, chat included. The `GenerationMiddleware` types are exported from the package root, while the `otelMiddleware` value lives on the `@tanstack/ai/middlewares/otel` subpath so importing `@tanstack/ai` never requires the optional `@opentelemetry/api` peer.

## Related

- [Middleware](./middleware) — the lifecycle this middleware hooks into
- [Debug Logging](./debug-logging) — quick console-output diagnostics, complementary to OTel