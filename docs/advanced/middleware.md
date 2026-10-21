---
title: Middleware
id: middleware
order: 1
description: "Run your own code at each step of a chat() call. Log runs, count tokens, change the request, guard tool calls, and filter the stream."
keywords:
  - tanstack ai
  - middleware
  - chat middleware
  - lifecycle hooks
  - observability
  - logging
  - tool interception
  - stream transform
---

You want to log each chat run, count tokens, or block a risky tool call. You do not want to put that code in every route and every tool.

Write it once as middleware. A middleware is an object with hooks. `chat()` calls each hook at a fixed step of the run.

## Quick setup

### 1. Write the middleware

```typescript
// logger.ts
import { type ChatMiddleware } from "@tanstack/ai";

export const logger: ChatMiddleware = {
  name: "logger",
  onStart: (ctx) => {
    console.log(`[${ctx.requestId}] started with ${ctx.model}`);
  },
  onAfterToolCall: (ctx, info) => {
    console.log(`[${ctx.requestId}] ${info.toolName} took ${info.duration} ms`);
  },
  onFinish: (ctx, info) => {
    console.log(
      `[${ctx.requestId}] done in ${info.duration} ms, ${info.usage?.totalTokens ?? 0} tokens`,
    );
  },
};
```

### 2. Add it to `chat()`

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { logger } from "./logger";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    middleware: [logger],
  });

  return toServerSentEventsResponse(stream);
}
```

### 3. Send a message

Send a message from your chat UI. The server console shows one line when the run starts, one line for each tool call, and one line when the run finishes:

```text
[chat-1760000000000-k3j9x2a] started with gpt-6.1-sol
[chat-1760000000000-k3j9x2a] done in 1840 ms, 312 tokens
```

The client code does not change. Middleware runs on the server only.

> [!TIP]
> Do you only want to see the chunks during development? Set `debug: { middleware: true }` on `chat()`. You do not need your own middleware for that. See [Debug Logging](./debug-logging).

## How it works

Every hook is optional. Add only the hooks you need. The ones you use most:

| Hook | When it runs | What it can do |
| --- | --- | --- |
| `onConfig` | At the start, and before each model call | Change messages, system prompts, tools, model options |
| `onStart` | Once, after the first `onConfig` | Start timers, write a log line |
| `onChunk` | For each chunk of the stream | Change, split, or drop the chunk |
| `onBeforeToolCall` | Before a tool runs | Change the input, skip the tool, or stop the run |
| `onAfterToolCall` | After a tool runs | Read the result, or replace it |
| `onUsage` | When a model call reports token usage | Count tokens and cost |
| `onFinish`, `onAbort`, `onError` | Once, at the end | Exactly one of the three runs |

More hooks exist for the agent loop, model errors, and interrupts. See [Middleware: Advanced](./middleware-advanced#hooks-reference).

The middleware run in array order:

- `onConfig` and `onChunk` pipe. Each middleware gets the output of the one before it.
- `onBeforeToolCall` stops at the first middleware that returns a decision.
- The other hooks run one after another, in order.

Each hook gets a context object (`ctx`) as its first argument. It has the IDs of the run, the current phase and iteration, and helpers like `ctx.abort()` and `ctx.defer()`.

## Common changes

### Change the tool choice of a call

Your agent hits its last model call, and the model calls a tool again. The run ends after the tool result, and the user gets no answer. Return `toolChoice: 'none'` on that last call, and the model answers in text:

```typescript
import {
  chat,
  maxIterations,
  toolDefinition,
  type ChatMiddleware,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const MAX_CALLS = 10;

const search = toolDefinition({
  name: "search",
  description: "Search the docs",
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => ({ hits: [`A page about ${query}`] }));

const answerOnLastCall: ChatMiddleware = {
  name: "answer-on-last-call",
  onConfig: (ctx) => {
    if (ctx.phase === "beforeModel" && ctx.iteration === MAX_CALLS - 1) {
      return { toolChoice: "none" };
    }
  },
};

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "How do I add a tool?" }],
  tools: [search],
  agentLoopStrategy: maxIterations(MAX_CALLS),
  middleware: [answerOnLastCall],
});
```

- `config.toolChoice` is the `chat()` option.
- The value you return applies to the next model call only. The call after it starts again from the `chat()` option.
- Return it in the `beforeModel` phase. A value from the `init` phase does not reach a model call.
- For the values, and what each provider does with them, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

### Change the HTTP requests of a call

Your proxy wants a header on each request. Or you want to log each model call. You do not need your own client for that. Return `wrapFetch` from `onConfig`:

```typescript
import { type ChatMiddleware } from "@tanstack/ai";

const traceHeader: ChatMiddleware = {
  name: "trace-header",
  onConfig: (ctx) => {
    if (ctx.phase !== "beforeModel") return;
    return {
      wrapFetch: (next) => (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-trace-id", `${ctx.requestId}-${ctx.iteration}`);
        return next(input, { ...init, headers });
      },
    };
  },
};
```

Do you want the same wrapper on every call of the run? Pass it to `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hi" }],
  wrapFetch: (next) => async (input, init) => {
    const started = Date.now();
    const response = await next(input, init);
    console.log(`model call: ${response.status} in ${Date.now() - started} ms`);
    return response;
  },
});
```

- A wrapper gets the next `fetch` and gives back a new one. It can change the URL, the headers, the request, or the response.
- A wrapper from `onConfig` applies to the next model call only.
- Wrappers chain. The `chat()` wrapper runs first, then the middleware wrappers in middleware order, then the fetch of the adapter.
- Each adapter page says if that adapter supports `wrapFetch`.

### Change the prompt cache of a call

A slow tool, like a build or a test run, can pause your agent for more than 5 minutes. The short Claude cache is gone by then. Return `promptCache` from `onConfig` to keep the cache longer from the next call on:

```typescript
import { type ChatMiddleware } from "@tanstack/ai";

const longCacheAfterTools: ChatMiddleware = {
  name: "long-cache-after-tools",
  onConfig: (ctx, config) => {
    if (ctx.phase !== "beforeModel" || ctx.iteration === 0) return;
    return { promptCache: { ...config.promptCache, retention: "long" } };
  },
};
```

- `config.promptCache` is the current value, with its `retention` and its `key`.
- The value you return goes to the adapter on the next model call. It stays until a middleware returns another one.
- For the retention values and what they cost, see [Prompt Caching](./prompt-caching#turn-it-off-or-keep-it-longer).

### Block a tool call

Some tools must never run from a chat. Return an `abort` decision from `onBeforeToolCall`, and the run stops before the tool runs:

```typescript
import { type ChatMiddleware } from "@tanstack/ai";

const guard: ChatMiddleware = {
  name: "guard",
  onBeforeToolCall: (ctx, hookCtx) => {
    if (hookCtx.toolName === "deleteDatabase") {
      return { type: "abort", reason: "Dangerous operation blocked" };
    }
  },
};
```

To change the input or skip the tool with your own result, see [onBeforeToolCall](./middleware-advanced#onbeforetoolcall).

## Ready-made middleware

You do not have to write the common cases yourself:

- `toolCacheMiddleware`: cache tool results.
- `contentGuardMiddleware`: redact or block text in the stream.
- `otelMiddleware`: send OpenTelemetry traces and metrics.

See [Built-in Middleware](./built-in-middleware). To keep long chats under the context limit, see [Compaction](./compaction).

## Advanced

Every hook in detail, the context object, capabilities, recipes, and the types are in [Middleware: Advanced](./middleware-advanced).
