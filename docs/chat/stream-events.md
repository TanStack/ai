---
title: Stream Events
id: stream-events
order: 3
description: "Read AG-UI stream chunks: event types, thread vs run ids, and tool input on the wire and in UIMessage parts."
keywords:
  - tanstack ai
  - ag-ui
  - stream events
  - StreamChunk
  - threadId
  - runId
  - TOOL_CALL
  - TEXT_MESSAGE_CONTENT
---

You have a stream of chunks. You need to know which ones are tokens, which ones are tools, and when the run is done.

Branch on `chunk.type`. Two ids frame every stream: `threadId` and `runId`.

## Event types

Public `StreamChunk` follows [AG-UI](https://docs.ag-ui.com/introduction). TanStack extras live under `metadata.tanstack`.

Do now:

- `RUN_STARTED`: `threadId`, `runId`
- `TEXT_MESSAGE_START` / `CONTENT` / `END`: `messageId`, `delta`
- `TOOL_CALL_START` / `ARGS` / `END`: `toolCallId`, `toolCallName`, args `delta`
- `RUN_FINISHED` / `RUN_ERROR`: usage and finish reason. A rate-limited `RUN_ERROR` also says how long to wait. See [Rate limits](#rate-limits)

Later:

- `REASONING_*` / `REASONING_ENCRYPTED_VALUE`: thinking content. See [Thinking and Reasoning](./thinking-content)
- `TEXT_MESSAGE_CHUNK` / `TOOL_CALL_CHUNK` / `REASONING_MESSAGE_CHUNK`: other AG-UI servers can send one of these in place of START / CONTENT / END. A chunk with no id continues the open stream of the same kind. A chunk of a different kind closes that stream. The client builds the same message from both forms
- `STEP_STARTED` / `STEP_FINISHED`: `stepName` only
- `CUSTOM`: `name` and `value`. See [Custom Events](../protocol/custom-events)
- `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` / `SUBAGENT_ERROR`: a child agent. Attributed events carry `subagentRunId`. A child that waits for an interrupt ends with `SUBAGENT_FINISHED` and `outcome: { type: 'suspended' }`. In request messages, each child message carries `subagentRunId`. See [Subagents](./subagents)

On `RUN_FINISHED`, in-process `chat()` still uses TanStack `TokenUsage` (`promptTokens`). The SSE and HTTP wires use the spec `usage` array (`inputTokens`). Read `finishReason` from `metadata.tanstack.finishReason`. Custom servers: see [Event metadata](../protocol/metadata).

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.6"),
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of stream) {
  if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    console.log(chunk.delta);
  }
  if (chunk.type === "RUN_FINISHED") {
    console.log(chunk.usage);
    console.log(chunk.metadata?.tanstack?.finishReason);
  }
}
```

## Token usage

You want to know what a run cost. `RUN_FINISHED.usage.promptTokens` is the full input, cached tokens included. The cache parts are also on `promptTokensDetails`:

- `cachedTokens`: tokens read from the cache.
- `cacheWriteTokens`: tokens written to the cache.

Need the uncached part? Subtract both:

```typescript
import type { TokenUsage } from "@tanstack/ai";

function uncachedTokens(usage: TokenUsage) {
  const read = usage.promptTokensDetails?.cachedTokens ?? 0;
  const written = usage.promptTokensDetails?.cacheWriteTokens ?? 0;
  return usage.promptTokens - read - written;
}
```

Upgrading the Anthropic, Bedrock, or Claude Code adapter? Their `promptTokens` used to count only the uncached tokens. If your code adds `cachedTokens` to `promptTokens`, remove that addition. Otherwise you count the cache two times.

## Rate limits

You got a 429 and want to know how long to wait. If the provider sends a `retry-after-ms` or `retry-after` header, the `RUN_ERROR` has the wait in `metadata.tanstack.retryAfterMs`, in milliseconds.

The Anthropic adapter and the adapters built on `@tanstack/openai-base` (for example OpenAI, Grok, and Groq) set it.

On the server:

```typescript
import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of stream) {
  if (chunk.type === "RUN_ERROR") {
    const waitMs = chunk.metadata?.tanstack?.retryAfterMs;
    console.log(waitMs === undefined ? "No wait sent" : `Retry in ${waitMs} ms`);
  }
}
```

The value also reaches the browser. On the client:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onChunk: (chunk) => {
    if (chunk.type === "RUN_ERROR") {
      console.log(chunk.metadata?.tanstack?.retryAfterMs);
    }
  },
});
```

No `retryAfterMs`? The provider sent no wait header, so pick your own backoff. The provider SDKs also retry a 429 by themselves first. To handle every 429 yourself, set `maxRetries: 0` in the adapter config.

### Let `chat()` retry for you

You can skip the wait loop. Pass `retry`, and `chat()` waits the `retryAfterMs`, then calls the model again:

```typescript
const stream = chat({
  adapter: anthropicText("claude-sonnet-5-5"),
  messages: [{ role: "user", content: "Hello!" }],
  retry: { maxRetries: 3, maxWaitMs: 30_000 },
});
```

Good to know:

- It retries only when the `RUN_ERROR` has a `retryAfterMs`.
- It skips waits longer than `maxWaitMs` (default 60 000). You get the `RUN_ERROR` instead.
- It never retries a call that already streamed output, so no text repeats.
- An abort stops the wait right away.

On a serverless route, a long wait keeps the request open. If your host has a short time limit, keep `maxWaitMs` low and let the client retry the rest.

## Threads and runs

Two ids frame every stream. They come from the AG-UI protocol, not from a storage layer.

- A **thread** (`threadId`) is the conversation. It stays the same across every exchange, reload, and device.
- A **run** (`runId`) is one execution inside that thread. It spans `RUN_STARTED` to `RUN_FINISHED` (or `RUN_ERROR`). Every start mints a fresh run id. A thread collects many runs over its life.

Tool calls and follow-up responses stream inside the same run. The whole [agentic cycle](./agentic-cycle) is one run, however many loops it takes.

```mermaid
flowchart LR
    subgraph thread ["Thread (threadId, stable)"]
        direction LR
        subgraph r1 ["Run r1, finished"]
            direction TB
            e1["RUN_STARTED then text then tool call then tool result then final text then RUN_FINISHED"]
        end
        subgraph r2 ["Run r2, finished"]
            direction TB
            e2["RUN_STARTED then text then RUN_FINISHED"]
        end
        subgraph r3 ["Run r3, running"]
            direction TB
            e3["RUN_STARTED then text"]
        end
        r1 --> r2 --> r3
    end
```

Because run ids are short-lived, anything long-lived anchors on the thread:

- [Resumable streams](../resumable-streams/overview) log delivery per `runId`
- [Server persistence](../persistence/chat-persistence#threads-runs-and-turns) stores the transcript per `threadId`

The media generation hooks take a `threadId` too. There it names a slot, not a conversation. See [Id map](../persistence/id-map).

## Tool input and output

SSE and HTTP `TOOL_CALL_END` does not carry parsed `input`. In-process `chat()` still has `input`. Tool input and output also live on `UIMessage` parts.

On the server, feed chunks into `StreamProcessor`. On the client, read `useChat` `messages`.

### Server

```typescript
import { chat, StreamProcessor, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
});

const stream = chat({
  adapter: openaiText("gpt-5.6"),
  messages: [{ role: "user", content: "What is the weather in Paris?" }],
  tools: [weatherTool],
});

const processor = new StreamProcessor();
for await (const chunk of stream) {
  processor.processChunk(chunk);
}
processor.finalizeStream();

for (const message of processor.getMessages()) {
  for (const part of message.parts) {
    if (part.type === "tool-call") {
      console.log(part.name, part.input, part.output);
    }
  }
}
```

### Type-safe tool call events

Pass your `.client()` tools to `useChat`. A check on `part.name` narrows `part.input` and `part.output`:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
}).client(async (input) => {
  return { location: input.location };
});

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [weatherTool],
});

for (const message of messages) {
  for (const part of message.parts) {
    if (part.type === "tool-call" && part.name === "get_weather") {
      console.log(part.input?.location);
    }
  }
}
```

You now know which chunk is text, which is a tool, and which id is the conversation versus one run.
