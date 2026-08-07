---
title: Streaming Structured Output UIs
id: structured-outputs-streaming
order: 3
description: "Fill a UI field-by-field with chat({ outputSchema, stream: true }) and useChat partial/final."
keywords:
  - tanstack ai
  - structured outputs
  - streaming
  - useChat outputSchema
  - partial
  - final
  - DeepPartial
  - progressive ui
---

# Streaming Structured Output UIs

If you need progressive field-by-field UI → stream on the server, read `partial` / `final` from `useChat({ outputSchema })`.

No progressive UI → [One-Shot](./one-shot). History across turns → [Multi-Turn](./multi-turn).

## Server

```typescript
// app/api/extract-person/route.ts
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string().meta({ description: "The person's full name" }),
  age: z.number().meta({ description: "The person's age in years" }),
  email: z.string().email(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    outputSchema: PersonSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

## Client

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

function PersonExtractor() {
  const { sendMessage, isLoading, partial, final } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendMessage("Extract: John Doe, 30, john@example.com");
      }}
    >
      <button disabled={isLoading}>Extract</button>
      <p>Name: {partial.name ?? "…"}</p>
      <p>Age: {partial.age ?? "…"}</p>
      <p>Email: {partial.email ?? "…"}</p>
      {final && <pre>Validated: {JSON.stringify(final, null, 2)}</pre>}
    </form>
  );
}
```

- **`partial`** — `DeepPartial<T>`; from latest assistant structured-output part; `{}` until first chunk
- **`final`** — `T | null` after `structured-output.complete`
- **`outputSchema` on hook** — client TS + progressive parse only; server validates
- Non-streaming adapters: `partial` stays `{}`, then `final` snaps

Omit `outputSchema` → no `partial` / `final`.

## Reasoning and tools on messages

| Chunk | Lands on |
|---|---|
| `REASONING_MESSAGE_CONTENT` | `ThinkingPart` |
| `TOOL_CALL_*` / `TOOL_CALL_RESULT` | `ToolCallPart` / `ToolResultPart` |
| `TEXT_MESSAGE_CONTENT` + `outputSchema` | `StructuredOutputPart` (`raw` / `partial` / `data`) |
| `TEXT_MESSAGE_CONTENT` without schema | `TextPart` |

```tsx ignore
const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
      if (part.type === "thinking") return <ReasoningView key={i} text={part.content} />;
      if (part.type === "tool-call") return <ToolCallView key={i} part={part} />;
      return null;
    })}
    <StructuredView data={final ?? partial} />
  </>
);
```

Structured JSON no longer routes through a `TextPart` — remove old `if (part.type === "text") return null` hacks for hiding JSON.

`onChunk` still fires after internal partial/final tracking. Same `outputSchema` / `partial` / `final` on React, Vue, Solid, Svelte.

## Stream events

`StructuredOutputStream<T>`: standard chunks + terminal:

```typescript ignore
{
  type: "CUSTOM",
  name: "structured-output.complete",
  value: {
    object: T,
    raw: string,
    reasoning?: string,
  },
}
```

`structured-output.start` carries `{ messageId }` so deltas route into `StructuredOutputPart`.

## Adapter coverage

| Adapter | `outputSchema` + `stream: true` |
|---|---|
| OpenAI / OpenRouter / Grok / Groq | Native incremental stream |
| Others (Anthropic, Gemini, Ollama, …) | Fallback: one `structured-output.complete` |

Consumer code is identical; only deltas differ.

## Iterate without HTTP

```typescript ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Extract: John Doe is 30, john@example.com" }],
  outputSchema: PersonSchema,
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
    console.log(chunk.value.object.name);
  }
}
```

Tools in the same run → [With Tools](./with-tools).
