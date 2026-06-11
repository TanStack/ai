---
title: Streaming Structured Output UIs
id: structured-outputs-streaming
order: 3
description: "Build a UI that fills in field by field as the model streams structured JSON. chat({ outputSchema, stream: true }) on the server, useChat({ outputSchema }) on the client — progressive partial state plus a validated terminal object."
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

You have an existing chat-style endpoint and you want the structured response to populate a UI _while_ the model is generating — a form filling in field by field, a card whose ingredients list grows as JSON streams in, a typewriter preview of a JSON-typed report. Blocking on `await chat({ outputSchema })` would leave the UI dark until the whole object is ready; this guide is the alternative.

By the end you'll have a server endpoint streaming structured JSON as Server-Sent Events, and a client that reads a typed `partial` (progressive object) and `final` (validated terminal object) from `useChat`.

> **Note:** This is the streaming counterpart of [One-Shot Extraction](./one-shot). If you don't need progressive UI updates, the one-shot path is simpler. If you want users to iterate on the object across multiple turns and keep history, see [Multi-Turn Chat](./multi-turn).

## Server endpoint

```typescript
// app/api/extract-person/route.ts (or your framework's equivalent)
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

That's the entire server side. `chat({ outputSchema, stream: true })` returns a `StructuredOutputStream<InferSchemaType<typeof PersonSchema>>` — an `AsyncIterable` of standard streaming events plus a terminal `structured-output.complete` event carrying the validated object. `toServerSentEventsResponse` knows what to do with it.

## Client with `useChat`

Pass the same schema to `useChat`. The hook gives you a progressively-parsed `partial` and a validated `final`:

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
      {/* `partial` fills in field by field as JSON streams in. */}
      <p>Name: {partial.name ?? "…"}</p>
      <p>Age: {partial.age ?? "…"}</p>
      <p>Email: {partial.email ?? "…"}</p>
      {final && <pre>Validated: {JSON.stringify(final, null, 2)}</pre>}
    </form>
  );
}
```

What the hook does for you:

- **`partial`** is `DeepPartial<z.infer<typeof PersonSchema>>` — every property optional, every nested array element optional. Updated from `TEXT_MESSAGE_CONTENT` deltas via the runtime's partial-JSON parser. The hook derives it from the latest assistant message's `structured-output` part (see [Multi-Turn Chat](./multi-turn) for why that distinction matters), so it reads `{}` between `sendMessage()` and the first chunk without any extra reset state.
- **`final`** is `z.infer<typeof PersonSchema> | null` — the validated terminal payload from the `structured-output.complete` event. `null` until the run completes successfully.
- **`outputSchema`** is used purely for client-side TypeScript inference. Validation still runs on the server against the schema you pass to `chat({ outputSchema })` on the server route — the client doesn't re-validate.
- The same shape works for **non-streaming adapters too**. If an adapter (Anthropic, Gemini, Ollama) returns a single `structured-output.complete` event with no incremental deltas, `partial` stays `{}` and `final` populates when the event arrives. Same consumer code.

`outputSchema` is optional: omit it and `useChat` returns its standard shape without `partial` / `final`.

## Rendering reasoning and tool calls

`partial` / `final` cover the structured payload. Reasoning tokens and tool calls land where they would in any other chat — on `messages[…].parts`:

| Chunk type | Where it lands on `messages[i].parts` |
|---|---|
| `REASONING_MESSAGE_CONTENT` | `ThinkingPart` on the assistant message |
| `TOOL_CALL_START` / `_ARGS` / `_END` | `ToolCallPart` on the assistant message |
| `TOOL_CALL_RESULT` | `ToolResultPart` on the tool message |
| `TEXT_MESSAGE_CONTENT` (with `outputSchema` set) | `StructuredOutputPart` on the assistant message — the JSON deltas accumulate into `part.raw` and the progressive parse populates `part.partial` |
| `TEXT_MESSAGE_CONTENT` (no `outputSchema`) | `TextPart` on the assistant message |

So render reasoning and tool calls the same way you'd render them in a normal chat UI:

```tsx
const last = messages.at(-1);

return (
  <>
    {last?.parts.map((part, i) => {
      if (part.type === "thinking") return <ReasoningView key={i} text={part.content} />;
      if (part.type === "tool-call") return <ToolCallView key={i} part={part} />;
      // The structured-output part is rendered separately via the
      // `partial` / `final` sugar below — no need to walk it here.
      return null;
    })}

    <StructuredView data={final ?? partial} />
  </>
);
```

> **Migration note:** Earlier versions of TanStack AI routed structured JSON deltas through a `TextPart` and required you to filter that part out of your renderer. That hack is gone — `TEXT_MESSAGE_CONTENT` on a structured-output run now routes into a dedicated `StructuredOutputPart` (with `raw`, `partial`, `data`, `status`, optional `errorMessage`). If your render loop still has an explicit `if (part.type === "text") return null;` line specifically for hiding structured JSON, you can remove it.

> **Going lower-level?** `useChat` still exposes `onChunk` if you want to observe individual chunks alongside the managed `partial` / `final` state (e.g. to drive a custom progress UI). Internal partial/final tracking runs first, then your `onChunk` callback fires with the same chunk — the two paths compose.

`useChat` (React, Vue, Solid) and `createChat` (Svelte) all accept the same `outputSchema` option and expose `partial` / `final` with the same semantics — only the reactivity primitive differs (React state, Vue `shallowRef`, Solid `Accessor`, Svelte reactive getter). See your framework's quick-start for the local idioms.

## What the stream contains

`chat({ outputSchema, stream: true })` returns a `StructuredOutputStream<T>` — the standard `StreamChunk` lifecycle plus a terminal `CUSTOM` event named `structured-output.complete`:

```typescript
{
  type: "CUSTOM",
  name: "structured-output.complete",
  value: {
    object: T;          // validated, parsed, typed
    raw: string;        // full accumulated JSON text
    reasoning?: string; // present only for thinking/reasoning models
  },
  // ...standard event fields (timestamp, model, …)
}
```

A `structured-output.start` event fires once at the beginning of the run carrying `{ messageId }`. Its job is to tell the client "the next batch of `TEXT_MESSAGE_CONTENT` deltas belongs to the assistant message with this id — route them into a `StructuredOutputPart` instead of building a free-form `TextPart`." The runtime also attaches the same `messageId` to the terminal `structured-output.complete` event's `value` so the client snaps the right assistant message's part on the way out — that extra field isn't on the public `StructuredOutputCompleteEvent<T>` shape (since consumer code typically doesn't need it; the start event already carries it), but you can read it off `value` at runtime if you need to.

## Adapter coverage

Streaming structured output works with **every adapter**, but only some support a true single-request streaming wire format:

| Adapter | Behavior with `outputSchema` + `stream: true` |
|---|---|
| `@tanstack/ai-openai` | Native single-request stream (Responses API, `text.format: json_schema`) |
| `@tanstack/ai-openrouter` | Native single-request stream (`response_format: json_schema`) |
| `@tanstack/ai-grok` | Native single-request stream (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-groq` | Native single-request stream (Chat Completions, `response_format: json_schema`) |
| Other adapters (anthropic, gemini, ollama, …) | Fallback: runs non-streaming `structuredOutput` and emits the final object as one `structured-output.complete` event |

The fallback path keeps the consumer code identical across providers — you always read the final object off `structured-output.complete` — but you won't see incremental deltas unless the adapter implements `structuredOutputStream` natively.

## Advanced: iterating the stream directly

When you don't need the SSE-over-HTTP boundary — Node scripts, CLIs, server endpoints that respond with a final JSON object instead of a stream, or tests — consume `chat({ outputSchema, stream: true })` as a plain async iterable:

```typescript
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
    // Validated and typed against PersonSchema.
    console.log(chunk.value.object.name);
    console.log(chunk.value.object.age);
  }
}
```

This is the same `StructuredOutputStream<T>` the server endpoint above hands to `toServerSentEventsResponse`. Pick this shape when you're a single process end-to-end; use the server-endpoint-plus-`useChat` shape when there's a network in the middle.

> **Combining with tools?** When `outputSchema`, `stream: true`, and `tools` are all set, the agent loop runs first and the structured stream emits its terminal event only after every tool completes. Tool-approval gates and client-tool invocations work the same as in a normal chat — see [With Tools](./with-tools) for the full pause/resume pattern.
