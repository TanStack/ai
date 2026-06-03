---
title: Structured Outputs Overview
id: structured-outputs-overview
order: 1
description: "Constrain TanStack AI responses to a JSON Schema so the model returns typed, predictable objects. Pick the journey that matches what you're building — one-shot extraction, a streaming UI, or a multi-turn structured chat."
keywords:
  - tanstack ai
  - structured outputs
  - json schema
  - zod
  - valibot
  - standard schema
  - type-safe llm
  - outputSchema
---

Structured outputs constrain model responses to match a JSON Schema you control. You get back a typed object — not a string you have to parse, not a "mostly-JSON" blob you have to guess at, not a regex match. The model either returns something that fits your schema or you get a typed error.

You wire this in once with `outputSchema`. The runtime takes care of the rest: it converts your schema to JSON Schema, hands it to the provider's native structured-output API, validates the response, and infers the TypeScript type from your schema definition.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const Person = z.object({ name: z.string(), age: z.number() });

const person = await chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "John Doe, 30" }],
  outputSchema: Person,
});

person.name; // string — fully typed, no cast
person.age;  // number
```

## Schema Libraries

TanStack AI accepts any library that implements [Standard JSON Schema](https://standardschema.dev/json-schema):

- [Zod](https://zod.dev/) (v4.2+)
- [ArkType](https://arktype.io/)
- [Valibot](https://valibot.dev/) (via `@valibot/to-json-schema`)
- Plain JSON Schema objects (loses TypeScript type inference — see [One-Shot Extraction](./one-shot#using-plain-json-schema))

Refer to your schema library's docs for field descriptions, refinements, and enums. TanStack AI converts the schema to JSON Schema automatically.

## Provider Support

Every adapter handles structured output through its provider's native API:

| Provider | Implementation |
|---|---|
| OpenAI | `response_format` with `json_schema` |
| Anthropic | Tool-based extraction |
| Google Gemini | `responseSchema` |
| Ollama | JSON mode with schema |
| OpenRouter / Grok / Groq | `response_format` with `json_schema` |

The provider-specific details are handled for you — the same `chat({ outputSchema })` call works across all of them.

## Which page do I read?

Pick the journey that matches what you're building. The four guides under "Structured Outputs" cover non-overlapping use cases — read the one that fits, not all of them.

| You want to… | Read |
|---|---|
| Extract one structured object from a single prompt — and consume it server-side (script, endpoint, CLI) or in a browser via `final` | [One-Shot Extraction](./one-shot) |
| Build a UI that fills in field-by-field as the model streams (progressive form, live card, typewriter preview) | [Streaming UIs](./streaming) |
| Let users iterate on a structured object across multiple turns — each turn produces a new typed object and history stays renderable | [Multi-Turn Chat](./multi-turn) |
| Combine structured output with tool calls (agent loop that runs tools first, then returns a typed object) | [With Tools](./with-tools) |

The streaming and multi-turn paths both build on `useChat({ outputSchema })`. The "with tools" path layers on top of either. Pick the one that describes your shipping shape — start there, follow the cross-links when you need a piece of another story.

> **Note:** Server-side validation is **path-dependent**. For the non-streaming agentic path (`await chat({ outputSchema })`), the engine runs Standard Schema validation inside the finalization step and routes failures through `onError` (the awaited promise rejects). For the streaming path (`chat({ outputSchema, stream: true })`), validation is deliberately deferred to the consumer — the engine forwards the adapter-emitted `structured-output.complete` event verbatim, and consumers read the validated object from the `value.object` field (or call `parseWithStandardSchema` themselves on the raw text). The schema you pass to `useChat({ outputSchema })` on the client is used for TypeScript inference and (in `useChat`) for client-side `parsePartialJSON`-based progressive parsing — the typed-object guarantee comes from the server-side path you pick.

## Middleware integration

Middleware configured on `chat()` now observes the final structured-output
provider call in addition to the agent loop. Chunks from the structured-output
adapter are attributed to `ctx.phase === 'structuredOutput'`; `onFinish` fires
exactly once at the end of the entire run.

> **Path-dependent:** Adapters that natively combine `tools` + a schema-
> constrained final answer in one streaming call do **not** issue a separate
> finalization round-trip. The engine wires `outputSchema` into the regular
> `chatStream` request and harvests the structured result from the agent
> loop's final-turn text. On this path the `'structuredOutput'` middleware
> phase does **not** fire — middleware sees the run through `'beforeModel'`
> / `'modelStream'` as usual, and `onStructuredOutputConfig` is not invoked.
>
> **Native combined providers:**
> - Modern OpenAI (Chat Completions + Responses)
> - Anthropic Claude 4.5+
> - Gemini 3.x
> - Grok 4.x family
>
> **Adapters without native combined-mode support** (Anthropic 4.4-, Gemini
> 2.x, Grok 2/3, Groq, Ollama, OpenRouter) keep the legacy finalization
> path and the `'structuredOutput'` phase fires as before.

### Observing structured-output chunks

```ts
import { chat } from "@tanstack/ai";
import type { ChatMiddleware } from "@tanstack/ai";

const tracing: ChatMiddleware = {
  name: "tracing",
  onChunk(ctx, chunk) {
    // Fires for chunks from the agent loop AND the final structured-output call
    span.addEvent("chunk", { phase: ctx.phase, type: chunk.type });
  },
};
```

### Transforming the JSON Schema before the provider call

Use the `onStructuredOutputConfig` hook when you need to mutate the schema:

```ts
import type { ChatMiddleware } from "@tanstack/ai";

const injectDefs: ChatMiddleware = {
  name: "inject-defs",
  onStructuredOutputConfig(_ctx, config) {
    return {
      outputSchema: { ...config.outputSchema, $defs: { ...sharedDefs } },
    };
  },
};
```

See [Advanced: Middleware](../advanced/middleware.md) for the full hook
reference.
