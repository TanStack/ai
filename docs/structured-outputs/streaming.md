---
title: Streaming Structured Output UIs
id: structured-outputs-streaming
order: 3
description: "Fill a form or card field by field while the model streams JSON. Stream with chat({ outputSchema, stream: true }) on the server and read partial and final from useChat({ outputSchema })."
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

Your structured reply takes a few seconds, and the UI stays empty until the whole object is ready. Users think the app froze.

Stream the JSON instead. `useChat` parses it as it arrives and gives you a typed `partial` object that fills in field by field.

## Quick setup

This setup assumes chat already works in your app. For the schema file and the `zod` install, see the [overview](./overview#quick-setup).

### 1. Stream from the server

Pass `outputSchema` and `stream: true`:

```typescript
// api/extract-person.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "../schemas/person";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    outputSchema: PersonSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

### 2. Render `partial` on the client

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { PersonSchema } from "./schemas/person";

export function PersonExtractor() {
  const { sendMessage, isLoading, partial, final } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void sendMessage("Extract: John Doe, 30, john@example.com");
      }}
    >
      <button disabled={isLoading}>Extract</button>
      <p>Name: {partial.name ?? "..."}</p>
      <p>Age: {partial.age ?? "..."}</p>
      <p>Email: {partial.email ?? "..."}</p>
      {final && <pre>{JSON.stringify(final, null, 2)}</pre>}
    </form>
  );
}
```

Click Extract. The name, age, and email appear one after the other. When the run ends, the full object shows in the `<pre>` block.

For a full TanStack Start app that fills a table from `partial.rows`, open [Streaming Structured Table](../tutorials/streaming-structured-table).

## How it works

- `partial` is `DeepPartial<T>`. Every property and every array element is optional. The hook parses the JSON deltas as they arrive. It reads `{}` from `sendMessage()` until the first chunk.
- `final` is `T | null`. It is `null` until the run completes. Then it holds the full object from the `structured-output.complete` event.
- The schema on `useChat` gives you types. The streaming path does not validate the object with your schema. If you need validation, do it in your own code.

Some adapters cannot stream the JSON. Anthropic, Gemini, and Ollama send the object as one event. Harness agents also send it at the end (see [Harness Agents](./harnesses)). In these cases `partial` stays `{}` until `final` is set. Your client code does not change.

If you leave out `outputSchema`, `useChat` returns its normal shape with no `partial` or `final`.

Vue, Solid, Svelte, Angular, Preact, and Octane take the same `outputSchema` option and return `partial` and `final`. Only the reactive type changes. See [Quick Start](../getting-started/quick-start) for the code in each framework.

## Show reasoning and tool calls too

`partial` and `final` show only the object of the latest turn. Reasoning, tool calls, and the object of every turn are on `messages[].parts`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

// The same schema as schemas/person.ts. In your app, import it from that file.
const PersonSchema = z.object({
  name: z.string().meta({ description: "The full name of the person" }),
  age: z.number().meta({ description: "The age in years" }),
  email: z.string().email(),
});

export function PersonRun() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/extract-person"),
    outputSchema: PersonSchema,
  });

  return (
    <div>
      <button onClick={() => void sendMessage("Extract: John Doe, 30")}>
        Extract
      </button>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            if (part.type === "thinking") {
              return <em key={i}>{part.content}</em>;
            }
            if (part.type === "tool-call") {
              return (
                <p key={part.id}>
                  {part.name} ({part.state})
                </p>
              );
            }
            if (part.type === "text") {
              return <p key={i}>{part.content}</p>;
            }
            if (part.type === "structured-output") {
              const person = part.data ?? part.partial;
              return <p key={i}>Name: {person?.name ?? "..."}</p>;
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

The `structured-output` part has these fields:

- `data`: the full object, after `structured-output.complete`.
- `partial`: the progressive parse of `raw` while the JSON streams.
- `raw`: the source JSON string.
- `status`: `streaming`, `complete`, or `error`.
- `errorMessage`: set when `status` is `error`.

`final` equals `data` on the latest assistant turn.

## Advanced

### Where each chunk lands

| Chunk type | Part on `messages[i].parts` |
| --- | --- |
| `REASONING_MESSAGE_CONTENT` | `ThinkingPart` on the assistant message |
| `TOOL_CALL_START` / `_ARGS` / `_END` | `ToolCallPart` on the assistant message |
| `TOOL_CALL_RESULT` | `ToolResultPart` on the tool message |
| `TEXT_MESSAGE_CONTENT`, with `outputSchema` | `StructuredOutputPart` on the assistant message. The JSON deltas build `part.raw`, and the parse fills `part.partial`. |
| `TEXT_MESSAGE_CONTENT`, no `outputSchema` | `TextPart` on the assistant message |

### What the stream contains

`chat({ outputSchema, stream: true })` returns a `StructuredOutputStream<T>`. It is an `AsyncIterable` of the normal stream events, plus two `CUSTOM` events:

- `structured-output.start` fires once, when the JSON begins. It carries `{ messageId }`. The client uses this id to send the next `TEXT_MESSAGE_CONTENT` deltas into a `StructuredOutputPart` on that message.
- `structured-output.complete` fires before `RUN_FINISHED` and carries the parsed object.

```typescript ignore
{
  type: "CUSTOM",
  name: "structured-output.complete",
  value: {
    object: T;          // full parsed object
    raw: string;        // full JSON text
    reasoning?: string; // only for thinking or reasoning models
  },
  // standard event fields, such as timestamp
  // the model id is in metadata.tanstack when present
}
```

If the parse fails, the stream emits `RUN_ERROR` in place of `RUN_FINISHED`.

At runtime, `value` on the complete event also holds the same `messageId`. The client uses it to find the right message. This field is not on the public `StructuredOutputCompleteEvent<T>` type, but you can read it from `value` if you need it.

### Adapter coverage

Streaming structured output works with every adapter. Only some send the JSON as a true stream in one request:

| Adapter | Behavior with `outputSchema` and `stream: true` |
| --- | --- |
| `@tanstack/ai-openai` | Native stream in one request (Responses API, `text.format: json_schema`) |
| `@tanstack/ai-openrouter` | Native stream in one request (`response_format: json_schema`) |
| `@tanstack/ai-grok` | Native stream in one request (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-groq` | Native stream in one request (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-bedrock` | Native stream through Converse or an OpenAI-compatible API |
| `@tanstack/ai-byteplus` | Native stream in one request on supported models. Other models emit `RUN_ERROR`. |
| `@tanstack/ai-llmgateway` | Native stream in one request (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-cloudflare` | Native stream in one request (Chat Completions, `response_format: json_schema`) |
| `@tanstack/ai-lovable` | Native stream in one request (Responses or Chat Completions) |
| Other adapters (Anthropic, Gemini, Ollama, and more) | Runs `structuredOutput` without streaming, then emits the object as one `structured-output.complete` event |

Your client code is the same on all adapters. You see deltas only when the adapter implements `structuredOutputStream`.

### Read the stream in a script

With no HTTP boundary (a Node script, a CLI, a test), iterate the stream directly:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { PersonSchema } from "./schemas/person";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Extract: John Doe is 30, john@example.com" }],
  outputSchema: PersonSchema,
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
    // Typed from PersonSchema. Validate here if you need to.
    console.log(chunk.value.object.name, chunk.value.object.age);
  }
}
```

This is the same `StructuredOutputStream<T>` that the server endpoint gives to `toServerSentEventsResponse`.

### Watch each chunk with `onChunk`

`useChat` also takes `onChunk`. The hook updates `partial` and `final` first. Then it calls your `onChunk` with the same chunk. Use it for a custom progress UI.

### With tools

When you set `outputSchema`, `stream: true`, and `tools`, the agent loop runs first. The structured stream emits its complete event only after every tool finishes. Tool approvals and client tools work the same as in a normal chat. See [With Tools](./with-tools).
