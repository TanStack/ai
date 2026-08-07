---
title: Structured Outputs Overview
id: structured-outputs-overview
order: 1
description: "Constrain responses with outputSchema — typed objects. Pick one-shot, streaming UI, multi-turn chat, or tools."
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

# Structured Outputs Overview

If you need a typed object instead of free text → pass `outputSchema` to `chat()`. Runtime converts schema → JSON Schema, uses the provider API, validates, and infers TypeScript types.

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

person.name; // string
person.age;  // number
```

## Schema libraries

Any [Standard JSON Schema](https://standardschema.dev/json-schema) library:

- [Zod](https://zod.dev/) (v4.2+)
- [ArkType](https://arktype.io/)
- [Valibot](https://valibot.dev/) (via `@valibot/to-json-schema`)
- Plain JSON Schema (loses TS inference — [One-Shot](./one-shot#using-plain-json-schema))

## Provider support

| Provider | Implementation |
|---|---|
| OpenAI / OpenRouter / Grok / Groq | `response_format` + `json_schema` |
| Anthropic | Tool-based extraction |
| Gemini | `responseSchema` |
| Ollama | JSON mode + schema |

Same `chat({ outputSchema })` call across adapters.

### Anthropic complexity limits

Anthropic may 400 on large/complex schemas (`Schema is too complex…`). Reduce branching:

- Drop unnecessary `.optional()`
- Avoid `.catch()` / `.default()` wrappers
- Flatten unions / deep nests
- Constrain optional strings (enums/formats)

See [Anthropic structured outputs](https://docs.claude.com/en/docs/build-with-claude/structured-outputs).

## Which page?

| You want | Read |
|---|---|
| One prompt → one object (server or `final`) | [One-Shot Extraction](./one-shot) |
| UI fills field-by-field while streaming | [Streaming UIs](./streaming) |
| Users iterate; history stays typed | [Multi-Turn Chat](./multi-turn) |
| Tools first, then typed object | [With Tools](./with-tools) |

### Validation paths

- **Non-streaming** `await chat({ outputSchema })` — engine validates; promise rejects on failure.
- **Streaming** `chat({ outputSchema, stream: true })` — consumer uses `structured-output.complete` `value.object` (or `parseWithStandardSchema`). Client `useChat({ outputSchema })` is for TS + progressive parse.

On both paths, optional fields widened to nullable for strict providers are un-widened: schema `.optional()` null → absent; genuine `.nullable()` null preserved.

## Middleware

Chunks from the structured-output adapter use `ctx.phase === 'structuredOutput'` when a separate finalization round-trip runs. `onFinish` fires once at run end.

Native combined `tools` + schema providers (modern OpenAI, Anthropic 4.5+, Gemini 3.x, Grok 4.x) may skip that phase — schema rides the agent stream; no `onStructuredOutputConfig`. Older / other adapters keep the finalization path.

```ts
import type { ChatMiddleware } from "@tanstack/ai";
import { span } from "./span";

const tracing: ChatMiddleware = {
  name: "tracing",
  onChunk(ctx, chunk) {
    if ("type" in chunk) {
      span.addEvent("chunk", { phase: ctx.phase, type: chunk.type });
    }
  },
};

// injectDefs: onStructuredOutputConfig can return a mutated outputSchema
// (e.g. inject $defs from a shared registry before the provider call).
```

Full hooks: [Middleware](../advanced/middleware.md).
