---
title: Built-in Middleware
id: built-in-middleware
order: 2
description: "Ready-made chat() middleware: toolCacheMiddleware caches tool results, contentGuardMiddleware redacts streamed text, and otelMiddleware sends OpenTelemetry traces."
keywords:
  - tanstack ai
  - middleware
  - built-in middleware
  - tool cache
  - content guard
  - redaction
  - opentelemetry
---

Your weather tool runs again for each question about the same city. Or the model writes a customer number into the reply, and you must hide it. You do not have to write middleware for these cases.

TanStack AI ships ready-made middleware. Add one to the `middleware` array of `chat()`:

| Middleware | Import | What it does |
| --- | --- | --- |
| `toolCacheMiddleware` | `@tanstack/ai/middlewares` | Caches tool results by tool name and arguments |
| `contentGuardMiddleware` | `@tanstack/ai/middlewares` | Redacts, changes, or blocks streamed text |
| `otelMiddleware` | `@tanstack/ai/middlewares/otel` | Sends OpenTelemetry spans and GenAI metrics |

## Quick setup

Cache the results of a tool for 60 seconds:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toolDefinition,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => {
  console.log(`getWeather ran for ${city}`);
  return { city, temperature: 21 };
});

// Create the cache once, so all requests share it.
const weatherCache = toolCacheMiddleware({
  ttl: 60_000,
  toolNames: ["getWeather"],
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    tools: [getWeather],
    middleware: [weatherCache],
  });

  return toServerSentEventsResponse(stream);
}
```

Ask about the weather in Paris. Then start a new chat and ask again. The server console shows `getWeather ran for Paris` only one time. The second answer comes from the cache.

Each built-in is a normal [`ChatMiddleware`](./middleware). You can combine them with your own middleware in the same array.

## toolCacheMiddleware

`toolCacheMiddleware` caches tool results by tool name and arguments. When the model calls a tool with the same name and arguments again, the middleware returns the cached result. The tool does not run again.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";
import { weatherTool, stockTool } from "./tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool, stockTool],
  middleware: [
    toolCacheMiddleware({
      ttl: 60_000, // Entries expire after 60 seconds
      maxSize: 50, // Keep at most 50 entries (LRU eviction)
      toolNames: ["getWeather"], // Cache only these tools
    }),
  ],
});
```

What it does:

- It caches only successful tool calls. It never stores errors.
- A cache hit returns `{ type: 'skip', result }` from `onBeforeToolCall`.
- When the default storage reaches `maxSize`, it removes the oldest entry (LRU).
- A cache hit moves the entry to the most recently used position.

> [!NOTE]
> Identical calls in one model turn run at the same time, so both of them miss the cache. To let the second call use the first result, set `toolExecution: 'sequential'` on `chat()`.

### Ignore some arguments in the cache key

Use `keyFn` when some arguments must not change the key. Here the cache ignores the page number:

```typescript
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

toolCacheMiddleware({
  keyFn: (toolName, args) => {
    // `args` is `unknown`, so narrow it with a type guard first.
    if (!isRecord(args)) return JSON.stringify([toolName, args]);
    const { page, ...rest } = args;
    return JSON.stringify([toolName, rest]);
  },
});
```

### Custom storage

The default cache lives in memory, inside one `toolCacheMiddleware()` instance. Pass a `storage` option to use another backend, like Redis, localStorage, or a database. A shared storage also shares the cache across `chat()` calls.

Implement the `ToolCacheStorage` interface from `@tanstack/ai/middlewares`:

```typescript
import { type ToolCacheEntry, type ToolCacheStorage } from "@tanstack/ai/middlewares";

interface MyStorage extends ToolCacheStorage {
  getItem: (key: string) => ToolCacheEntry | undefined | Promise<ToolCacheEntry | undefined>;
  setItem: (key: string, value: ToolCacheEntry) => void | Promise<void>;
  deleteItem: (key: string) => void | Promise<void>;
}

// ToolCacheEntry is { result: unknown; timestamp: number }
```

- Each method can return a `Promise`, for async backends.
- The middleware checks the TTL. Your storage only stores and returns entries.
- With a custom storage, the middleware ignores `maxSize`. The storage controls its own size.

A Redis storage:

```typescript
import { chat } from "@tanstack/ai";
import { createClient } from "redis";
import { toolCacheMiddleware, type ToolCacheStorage } from "@tanstack/ai/middlewares";
import { adapter, messages } from "./server";
import { weatherTool } from "./tools";

const redis = createClient();

const redisStorage: ToolCacheStorage = {
  getItem: async (key) => {
    const raw = await redis.get(`tool-cache:${key}`);
    return raw ? JSON.parse(raw) : undefined;
  },
  setItem: async (key, value) => {
    await redis.set(`tool-cache:${key}`, JSON.stringify(value));
  },
  deleteItem: async (key) => {
    await redis.del(`tool-cache:${key}`);
  },
};

const stream = chat({
  adapter,
  messages,
  tools: [weatherTool],
  middleware: [toolCacheMiddleware({ storage: redisStorage, ttl: 60_000 })],
});
```

To share a cache across requests in one process, create the storage once, outside the request handler:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import {
  toolCacheMiddleware,
  type ToolCacheEntry,
  type ToolCacheStorage,
} from "@tanstack/ai/middlewares";
import { openaiText } from "@tanstack/ai-openai";
import { weatherTool } from "./tools";

const entries = new Map<string, ToolCacheEntry>();

const sharedStorage: ToolCacheStorage = {
  getItem: (key) => entries.get(key),
  setItem: (key, value) => {
    entries.set(key, value);
  },
  deleteItem: (key) => {
    entries.delete(key);
  },
};

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
    tools: [weatherTool],
    middleware: [toolCacheMiddleware({ storage: sharedStorage })],
  });

  return toServerSentEventsResponse(stream);
}
```

## contentGuardMiddleware

`contentGuardMiddleware` filters or changes streamed text in `onChunk`. Use it to:

- Redact sensitive data (SSNs, emails, API keys).
- Filter profanity.
- Rewrite text while it streams.

The rules apply to `TEXT_MESSAGE_CONTENT` chunks only. All other chunk types pass through unchanged.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { contentGuardMiddleware } from "@tanstack/ai/middlewares";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Tell me about customer 123-45-6789" }],
  middleware: [
    contentGuardMiddleware({
      rules: [
        // Regex and replacement
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN REDACTED]" },
        // Custom transform function
        { fn: (text) => text.replaceAll("badword", "****") },
      ],
      strategy: "buffered",
    }),
  ],
});
```

### Matching strategies

- **`'buffered'` (default).** The middleware collects the text and applies the rules to the settled part. It holds back the last `bufferSize` characters, so it still catches a pattern split across two chunks (`"...123-45"` then `"-6789..."`). It flushes the buffer when the message or the run ends. Use it for most redaction.
- **`'delta'`.** The middleware applies the rules to each delta alone, when it arrives. This is the fastest, but a pattern split across two chunks can get through. If each pattern always fits in one delta, you can use it.

### What it does

- A rule that does not change the text does nothing. The chunk passes through unchanged.
- With `blockOnMatch: true`, the middleware drops a matched chunk (it returns `null` from `onChunk`). It does not send the redacted text.
- `onFiltered` is for logs and audits. It gets the text before and after, but it does not change what goes out.

## otelMiddleware

`otelMiddleware` sends OpenTelemetry traces and metrics for each `chat()` call:

- A root span for each call.
- A child span for each agent-loop iteration.
- A grandchild span for each tool run.

All spans have [GenAI semantic-convention attributes](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { otelMiddleware } from "@tanstack/ai/middlewares/otel";
import { trace, metrics } from "@opentelemetry/api";
import { messages } from "./server";

const otel = otelMiddleware({
  tracer: trace.getTracer("my-app"),
  meter: metrics.getMeter("my-app"), // optional, turns on the GenAI histograms
});

const result = await chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
  middleware: [otel],
});
```

`otelMiddleware` needs the optional `@opentelemetry/api` peer dependency. It has its own options for content capture, redaction, span names, extra attributes, and lifecycle callbacks. See [OpenTelemetry](./otel) for the setup, the list of spans and metrics, and all options.

## Write your own

The built-ins are normal `ChatMiddleware` objects. To write your own, see [Middleware](./middleware).

## Advanced

### Import paths

`toolCacheMiddleware` and `contentGuardMiddleware` come from the `@tanstack/ai/middlewares` barrel. `otelMiddleware` has its own subpath, `@tanstack/ai/middlewares/otel`. So an import from the barrel never loads `@opentelemetry/api`, which is an optional peer dependency.

Policies that belong to your app, like tool-call budgets, stay in your code. See the [tool-call budget recipe](../chat/agentic-cycle#tool-call-budgets-middleware-recipe).

### toolCacheMiddleware options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxSize` | `number` | `100` | The maximum number of entries. The oldest entry goes first (LRU). Applies to the default in-memory storage only. |
| `ttl` | `number` | `Infinity` | Time to live in milliseconds. The middleware does not return expired entries. |
| `toolNames` | `string[]` | All tools | Cache only these tools. Other tools pass through. |
| `keyFn` | `(toolName, args) => string` | `JSON.stringify([toolName, args])` | Builds the cache key. |
| `storage` | `ToolCacheStorage` | In-memory Map | A custom storage backend. When you set it, the middleware ignores `maxSize`. |

### contentGuardMiddleware options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rules` | `ContentGuardRule[]` | none | **Required.** The rules apply in order. Each rule gets the output of the rule before it. A rule is `{ pattern: RegExp; replacement: string }` or `{ fn: (text: string) => string }`. |
| `strategy` | `'delta' \| 'buffered'` | `'buffered'` | How the middleware matches text. See [Matching strategies](#matching-strategies). |
| `bufferSize` | `number` | `50` | Buffered only. The number of characters to hold back, so patterns across chunk boundaries still match. Set it to at least the length of your longest pattern. The middleware flushes the buffer at the end of the stream. |
| `blockOnMatch` | `boolean` | `false` | When `true`, drop the whole chunk if a rule changes the text. |
| `onFiltered` | `(info: ContentFilteredInfo) => void` | none | Runs each time a rule changes the text. Gets `{ messageId, original, filtered, strategy }`. |
