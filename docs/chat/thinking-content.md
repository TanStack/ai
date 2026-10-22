---
title: Thinking & Reasoning
id: thinking-content
order: 5
description: "Show the thinking of a reasoning model in your chat UI. The thinking streams as ThinkingPart entries in message.parts, in the order the model used."
keywords:
  - tanstack ai
  - thinking
  - reasoning
  - extended thinking
  - claude thinking
  - o-series
  - chain of thought
  - ThinkingPart
---

A thinking part holds the text a reasoning model writes before the answer. Render it in order with the tool calls.

TanStack AI streams the thinking as `ThinkingPart` entries in `message.parts`, next to the text and the tool calls.

## Quick setup

### 1. Turn thinking on in the server route

Set `reasoning` on `chat()`. It works the same on every provider:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: anthropicText("claude-sonnet-5-5"),
    messages,
    threadId,
    runId,
    reasoning: "high",
  });

  return toServerSentEventsResponse(stream);
}
```

### 2. Render the thinking parts on the client

Put each thinking part in a box that the user can open:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const { messages } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return messages.map((message) => (
    <div key={message.id}>
      {message.parts.map((part, index) => {
        if (part.type === "thinking") {
          return (
            <details key={index}>
              <summary>Thinking...</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{part.content}</pre>
            </details>
          );
        }
        if (part.type === "text") {
          return <p key={index}>{part.content}</p>;
        }
        return null;
      })}
    </div>
  ));
}
```

Ask a hard question. The thinking box fills first, then the answer streams below it.

Some models think without sending text back. For those models, the thinking part stays empty.

## How it works

The thinking streams before the answer. Its `content` grows token by token, the same as a text part.

The usual order of events:

1. `REASONING_START` and `REASONING_MESSAGE_START` start the thinking.
2. `REASONING_MESSAGE_CONTENT` events add tokens to `ThinkingPart.content`.
3. `TEXT_MESSAGE_START` starts the visible answer.
4. `TEXT_MESSAGE_CONTENT` events stream the answer text.

`useChat` in every framework updates `messages` with both thinking parts and text parts while they arrive.

To see levels and token budgets, read [Reasoning](./reasoning).

## Keep the thinking out of the UI

If you want the model to think but do not want to show the text, set `summary: false`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: { level: "high", summary: false },
});
```

Then no thinking text streams.

## Thinking and tool calls in order

Claude can think, call a tool, think again, then call another tool. Your UI must show that order, not all the thinking in one block at the top.

You get this order by default. `message.parts` keeps the order that the model used. For that answer, the part types are:

```text
thinking, tool-call, thinking, tool-call
```

What this means for your UI:

- Each thinking block is its own `ThinkingPart`. Each one gets its own `REASONING_MESSAGE_END` and `REASONING_END`.
- Text after a second thinking block starts a new text part. You get "A" and "B" as two parts, not "AB".
- The render loop in the [Quick setup](#2-render-the-thinking-parts-on-the-client) already walks the parts in order. You do not need extra code.

## Advanced

### The `ThinkingPart` type

This is the type in `@tanstack/ai`, which the server and stored messages use. The thinking part that `useChat` returns has only `type` and `content`.

```typescript
interface ThinkingPart {
  type: "thinking";
  content: string;
  stepId?: string;
  signature?: string;
  redacted?: boolean;
}
```

The thinking content comes from the `REASONING_*` events and from `REASONING_ENCRYPTED_VALUE`. `STEP_STARTED` and `STEP_FINISHED` carry only `stepName`. They do not carry thinking text.

### Signed thinking

Thinking without a signature stays in the UI. Signed thinking is a `ThinkingPart` with a `signature`. Anthropic extended thinking uses it.

- The next request sends signed thinking back in the same order as the original response. This includes the order around provider-executed tools.
- In the next request body, the signature goes on the spec field `encryptedValue` of the `role: "reasoning"` message.
- In the stream, the signature arrives as a `REASONING_ENCRYPTED_VALUE` event.

### Redacted thinking

Claude can send a redacted thinking block. It is encrypted, so it has no text. It arrives as a `ThinkingPart` with:

- `redacted: true`
- an empty `content`
- the encrypted data in `signature`

Keep the part in your stored messages. The next request sends it back to Claude unchanged. In a UI, the part from `useChat` has an empty `content`. Show a short label such as "Thinking hidden" in place of the empty text.

### The block order goes back to the model

The stored message keeps a `blockOrder` map. The next request sends the blocks in the same order. Claude needs this, because it signs each thinking block against the blocks before it.

Gemini, Mistral, and Bedrock Converse also send thinking back on the next request, for history from the same model. History from another model goes in as plain text. See [Keep saved history when you switch](../advanced/runtime-adapter-switching#keep-saved-history-when-you-switch).

### Provider options

For all provider options, see the [Anthropic adapter](../adapters/anthropic) and the [OpenAI adapter](../adapters/openai). To see how thinking fits into a tool loop, read [Agentic Cycle](./agentic-cycle).
