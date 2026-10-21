---
title: OpenTelemetry
id: otel
order: 3
description: "Send OpenTelemetry traces and metrics from every TanStack AI chat() call and media call. The spans follow the OTel GenAI semantic conventions."
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

Your app already sends traces to an OpenTelemetry backend, but the AI calls are a black box. You cannot see which model ran, how many tokens it used, or which tool was slow.

Add `otelMiddleware` to your `chat()` call. Each call then sends spans and metrics with the [GenAI semantic-convention attributes](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

## Quick setup

### 1. Install the OpenTelemetry API

`@opentelemetry/api` is an optional peer dependency of `@tanstack/ai`:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @opentelemetry/api
vue: @opentelemetry/api
solid: @opentelemetry/api
svelte: @opentelemetry/api
preact: @opentelemetry/api
angular: @opentelemetry/api
vanilla: @opentelemetry/api
octane: @opentelemetry/api

<!-- ::end:tabs -->

### 2. Start your OpenTelemetry SDK

Start the SDK the way your app already does, for example with `@opentelemetry/sdk-node`. The middleware uses the `Tracer` and `Meter` that you give it.

### 3. Add the middleware to `chat()`

```ts
import { chat } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { openaiText } from '@tanstack/ai-openai'
import { trace, metrics } from '@opentelemetry/api'

const otel = otelMiddleware({
  tracer: trace.getTracer('my-app'),
  meter: metrics.getMeter('my-app'),
})

const { text } = await chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [otel],
  stream: false,
})
```

The middleware lives on its own subpath. Apps that do not import it do not need `@opentelemetry/api`.

Open your trace viewer. Each `chat()` call now shows as one span tree, with the model, the token counts, and each tool call.

## How it works

Each `chat()` call makes a span tree:

```text
chat gpt-6.1-sol              (root, kind: INTERNAL)
├── chat gpt-6.1-sol #0       (iteration, kind: CLIENT)
│   ├── execute_tool get_weather
│   └── execute_tool get_time
└── chat gpt-6.1-sol #1       (iteration, kind: CLIENT)
```

- The **root span** covers the whole `chat()` call.
- Each **iteration span** is one model call: one turn of the agent loop, or the final structured-output request. The spans are numbered (`#0`, `#1`) in the order of the model calls.
- Each **tool span** is one tool call.

When you give a `Meter`, the middleware also records two token and duration histograms. See [Metrics](#metrics).

By default, only metadata goes onto the spans. Prompts and answers stay off until you turn them on.

## Capture prompts and completions

Set `captureContent: true` to record prompt and answer content. Pass a `redact` function to remove personal data before anything is recorded:

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

If `redact` throws, the middleware writes the text `"[redaction_failed]"` into the span event and logs a warning. It never falls back to the raw content. So a broken redactor stops the capture, and no prompt leaks to a third-party backend.

For the event names, the length limit, and media parts, see [Content capture details](#content-capture-details).

## Trace media calls

The media activities accept the same `otelMiddleware` value on their `middleware` option:

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

A media call is one request and one response (or a submit and a poll, for video). So it makes one `CLIENT` span, not a span tree. You can pass the same `otel` value to `chat()`, `decide()`, and any media activity.

## Advanced

### Span attributes

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
| root / iteration | `gen_ai.usage.total_tokens` | total from the provider |
| root / iteration | `gen_ai.usage.cost` | cost from the provider, when available |
| root / iteration | `gen_ai.usage.cache_read.input_tokens` | cached prompt tokens, when reported |
| root / iteration | `gen_ai.usage.cache_creation.input_tokens` | cache-write prompt tokens, when reported |
| root / iteration | `gen_ai.usage.reasoning.output_tokens` | reasoning or thinking tokens, when reported |
| root / iteration | `tanstack.ai.usage.billed_quantity` | billed quantity that is not tokens, when reported |
| root / iteration | `tanstack.ai.usage.billed_unit` | unit of the billed quantity (`seconds`, `units`, ...) |
| root / iteration | `tanstack.ai.usage.upstream_cost` | upstream cost of a gateway (for example OpenRouter), when reported |
| root / iteration | `tanstack.ai.usage.upstream_input_cost` | upstream input cost, when reported |
| root / iteration | `tanstack.ai.usage.upstream_output_cost` | upstream output cost, when reported |
| iteration | `gen_ai.response.finish_reasons` | `[stop]`, `[tool_calls]`, ... |
| root | `gen_ai.usage.input_tokens` | sum of all iterations |
| root | `gen_ai.usage.output_tokens` | sum of all iterations |
| root | `tanstack.ai.iterations` | iteration count |
| tool | `gen_ai.tool.name` | tool name |
| tool | `gen_ai.tool.call.id` | tool call id |
| tool | `gen_ai.tool.type` | `function` |
| tool | `tanstack.ai.tool.outcome` | `success` / `error` |

How the usage attributes work:

- Usage attributes other than input and output tokens appear only when the provider reports them.
- The cache and reasoning attributes use the official GenAI semconv names.
- `gen_ai.usage.cost` and `gen_ai.usage.total_tokens` are common extensions that backends like PostHog read. Without them, a backend calculates the cost from its own price table, and loses cache discounts and gateway markup.
- Fields with no standard name (the billed quantity and unit, and the upstream cost split) use the `tanstack.ai` namespace.

For billing that is not in tokens (seconds of video or transcription, fal endpoint units), the middleware sends `tanstack.ai.usage.billed_quantity` and `tanstack.ai.usage.billed_unit` as a pair from `usage.billed`. Backends can then label and add up media usage without knowing the provider.

### Structured output spans

A structured-output call with no tools skips the agent loop and runs only the final request. That path still opens an iteration span, through the `structuredOutput` middleware phase. So backends that read generation spans (for example PostHog `$ai_generation`) and `captureContent` both work.

Native combined mode (`supportsCombinedToolsAndSchema`) does not run that phase. The single `beforeModel` span covers the combined call.

### Metrics

When you give a `Meter`, the middleware records two GenAI-standard histograms:

- `gen_ai.client.operation.duration` (seconds): recorded **once for each `chat()` call**. It covers all agent-loop iterations and tool calls. On an error or an abort, the record has an `error.type` attribute: the `name` of the thrown error, or `"cancelled"` for an abort.
- `gen_ai.client.token.usage` (tokens): recorded **once for each iteration**, as two records (input and output), tagged with `gen_ai.token.type`.

The metric attributes do not include `gen_ai.response.id` and `gen_ai.response.model`. This keeps the number of series low, because request ids and custom model names change on each request.

### Content capture details

With `captureContent: true`, content goes onto the spans as OTel span events, with the GenAI names:

- `gen_ai.user.message`, `gen_ai.system.message`, `gen_ai.assistant.message`
- `gen_ai.tool.message`, `gen_ai.choice`

Limits and timing:

- The assistant text (the `gen_ai.choice` event) is limited to `maxContentLength` characters. The default is 100,000. Longer text is cut and ends with `"…"`. Set `maxContentLength: 0` to remove the limit.
- The prompt, system, and user events fire from `onConfig` at the start of each iteration. So each iteration span has the full history again, the same as the provider gets it.

Multimodal messages (images, audio, video, documents) keep their parts in `gen_ai.input.messages`, in the OTel GenAI part shapes:

- Text: `{ "type": "text", "content": "..." }`. `redact` runs on it.
- URL source: `{ "type": "uri", "modality": "image", "uri": "https://...", "mime_type": "image/png" }`.
- Provider file handle: `{ "type": "file", "modality": "image", "file_id": "..." }`.
- Inline base64 data or a `data:` URL: a `[image]` text placeholder, so that the bytes do not go onto the span.

Span events stay flat strings, with the same placeholders for each media part (`look at this [image]`).

### Extension points

All four callbacks are optional. Each one runs inside a try/catch. A callback that throws makes a log line, and the chat continues.

| Callback | What it does |
| --- | --- |
| `spanNameFormatter(info)` | Returns the span name. `info.kind` is `'chat'`, `'iteration'`, `'tool'`, or `'generation'`. |
| `attributeEnricher(info)` | Returns extra attributes for each span. Fires once for each span. |
| `onBeforeSpanStart(info, options)` | Returns the `SpanOptions` for `tracer.startSpan(...)`. Use it to add links, custom start times, or default attributes. |
| `onSpanEnd(info, span)` | Fires immediately before each `span.end()`. Use it to record custom events, or per-tool metrics with your own `Meter`. |

Change the span names:

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

Add an attribute to each span:

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

Record a metric for each tool call:

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
      // The span still records. Read timestamps from your own store if you need them.
      toolDuration.record(1, { 'tool.name': info.toolName })
    }
  },
})
```

### Media spans

These activities accept `otelMiddleware`:

- `generateImage`, `generateVideo`, and `generateLiveVideo`.
- `generateWorld` and `generateAudio`.
- `generateSpeech` and `generateTranscription`.

Each media call makes one `CLIENT` span, tagged with the `gen_ai.operation.name` of the activity:

| Activity | `gen_ai.operation.name` |
| --- | --- |
| `generateImage` | `image_generation` |
| `generateVideo` | `video_generation` |
| `generateAudio` | `audio_generation` |
| `generateSpeech` | `text_to_speech` |
| `generateTranscription` | `transcription` |
| `generateWorld` | `world_generation` |
| `generateLiveVideo` | `live_video_generation` |
| `summarize` | `summarize` |
| `decide` | `evaluate` |

What the span has:

- At the start: `gen_ai.system` and `gen_ai.request.model`.
- At the end: the same `gen_ai.usage.*` and `tanstack.ai.usage.*` attributes as a chat span. This includes the `billed_quantity` and `billed_unit` pair for media that bills in units.
- With a `Meter`: the `gen_ai.client.operation.duration` histogram, tagged for each activity.

How video spans work:

- Streaming video: the span covers the full create, poll, and complete cycle.
- Non-streaming video is two calls. The submit itself makes no span. The span opens when the provider accepts the job. The `getVideoJobStatus()` poll that sees a final state ends it.
- If a consumer of a streaming video stops before the end, `onAbort` ends the span with status `ERROR` and `tanstack.ai.completion.reason = cancelled`. The span does not leak.

The four extension points also apply to media spans. Media spans report `kind: 'generation'`.

The shared lifecycle hooks (`onStart`, `onUsage`, `onFinish`, `onAbort`, `onError`) use the `GenerationMiddlewareContext`, which is the same for each activity. That is why one instance works everywhere. For a custom backend, implement the base `GenerationMiddleware` contract. Its hooks get the `GenerationMiddlewareContext` and fire for each activity, chat included.

The `GenerationMiddleware` types come from the package root. The `otelMiddleware` value lives on the `@tanstack/ai/middlewares/otel` subpath, so an import of `@tanstack/ai` never needs the optional `@opentelemetry/api` peer.

### Capturing media content

Set `captureContent: true` to record what a media call asked for and what came back. The media span then gets the same attributes as a chat iteration span:

- `gen_ai.input.messages` and `langfuse.observation.input`: one `user` message. It holds the prompt as a text part, and each input image, video, or audio as a part. For `generateSpeech`, it holds the text to speak. For `generateTranscription`, it holds the source audio.
- `gen_ai.output.messages` and `langfuse.observation.output`: one `assistant` message. It holds each URL of a generated image, audio, or video as a `uri` part. For `generateTranscription`, it holds the transcript as a text part.

Media parts use the part shapes from [Content capture details](#content-capture-details):

- A URL becomes `{ "type": "uri", "modality": "image", "uri": "https://..." }`.
- Inline data never goes onto the span. Base64 output, a `data:` URL, a `File`, or a `Blob` becomes a text placeholder such as `[image]`.
- `redact` and `maxContentLength` apply to each text part.

For non-streaming video, the `getVideoJobStatus()` span has the output URL but not the prompt. Use `generateVideo({ stream: true })` to get both on one span.

For quick console output while you develop, use [Debug Logging](./debug-logging). To learn the lifecycle that this middleware hooks into, see [Middleware](./middleware).
