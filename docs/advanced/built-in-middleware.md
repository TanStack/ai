---
title: Built-in Middleware
id: built-in-middleware
order: 2
description: "Ready-made TanStack AI chat() middleware — toolCacheMiddleware for caching tool results, contentGuardMiddleware for redacting streamed text, and otelMiddleware for OpenTelemetry tracing."
keywords:
  - tanstack ai
  - middleware
  - built-in middleware
  - tool cache
  - content guard
  - redaction
  - opentelemetry
---

TanStack AI ships ready-made middleware so you don't have to hand-roll the common cases. Each one is an ordinary [`ChatMiddleware`](./middleware) — drop it into the `middleware` array of any `chat()` call. This page documents every built-in.

| Middleware | Import | What it does |
|------------|--------|--------------|
| `toolCacheMiddleware` | `@tanstack/ai/middlewares` | Cache tool-call results by name + arguments |
| `contentGuardMiddleware` | `@tanstack/ai/middlewares` | Redact / transform / block streamed text content |
| `otelMiddleware` | `@tanstack/ai/middlewares/otel` | Emit OpenTelemetry spans + GenAI metrics |

> `toolCacheMiddleware` and `contentGuardMiddleware` are exported from the main `@tanstack/ai/middlewares` barrel. `otelMiddleware` lives on its own subpath (`@tanstack/ai/middlewares/otel`) so that importing the barrel never eagerly pulls in `@opentelemetry/api` (an optional peer dependency).

## toolCacheMiddleware

Caches tool call results based on tool name and arguments. When a tool is called with the same name and arguments as a previous call, the cached result is returned immediately without re-executing the tool.

```typescript
import { chat } from "@tanstack/ai";
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [weatherTool, stockTool],
  middleware: [
    toolCacheMiddleware({
      ttl: 60_000, // Cache entries expire after 60 seconds
      maxSize: 50, // Keep at most 50 entries (LRU eviction)
      toolNames: ["getWeather"], // Only cache specific tools
    }),
  ],
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSize` | `number` | `100` | Maximum cache entries. Oldest evicted first (LRU). Only applies to the default in-memory storage. |
| `ttl` | `number` | `Infinity` | Time-to-live in milliseconds. Expired entries are not served. |
| `toolNames` | `string[]` | All tools | Only cache these tools. Others pass through. |
| `keyFn` | `(toolName, args) => string` | `JSON.stringify([toolName, args])` | Custom cache key derivation. |
| `storage` | `ToolCacheStorage` | In-memory Map | Custom storage backend. When provided, `maxSize` is ignored — the storage manages its own capacity. |

**Behaviors:**

- Only successful tool calls are cached — errors are never stored
- Cache hits trigger `{ type: 'skip', result }` via `onBeforeToolCall`
- LRU eviction: when `maxSize` is reached, the oldest entry is removed (default storage only)
- Cache hits refresh the entry's LRU position (moved to most-recently-used)

**Custom key function** — useful when you want to ignore certain arguments:

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

toolCacheMiddleware({
  keyFn: (toolName, args) => {
    // Ignore pagination, cache by query only. `args` is `unknown`, so
    // narrow it with a type guard before destructuring.
    if (!isRecord(args)) return JSON.stringify([toolName, args]);
    const { page, ...rest } = args;
    return JSON.stringify([toolName, rest]);
  },
});
```

### Custom Storage

By default the cache lives in-memory and is scoped to a single `toolCacheMiddleware()` instance. Pass a `storage` option to use an external backend like Redis, localStorage, or a database. This also enables **sharing a cache across multiple `chat()` calls**.

The storage interface:

```typescript
// Implement this interface (exported from `@tanstack/ai/middlewares`):
interface ToolCacheStorage {
  getItem: (key: string) => ToolCacheEntry | undefined | Promise<ToolCacheEntry | undefined>;
  setItem: (key: string, value: ToolCacheEntry) => void | Promise<void>;
  deleteItem: (key: string) => void | Promise<void>;
}

// ToolCacheEntry is { result: unknown; timestamp: number }
```

All methods may return a `Promise` for async backends. The middleware handles TTL checking — your storage just needs to store and retrieve entries.

**Redis example:**

```typescript
import { createClient } from "redis";
import { toolCacheMiddleware, type ToolCacheStorage } from "@tanstack/ai/middlewares";

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

**Sharing a cache across requests:**

```typescript
// Create storage once, reuse across chat() calls
const sharedStorage: ToolCacheStorage = {
  getItem: (key) => globalCache.get(key),
  setItem: (key, value) => { globalCache.set(key, value); },
  deleteItem: (key) => { globalCache.delete(key); },
};

// Both requests share the same cache
app.post("/api/chat", async (req) => {
  const stream = chat({
    adapter,
    messages: req.body.messages,
    tools: [weatherTool],
    middleware: [toolCacheMiddleware({ storage: sharedStorage })],
  });
  return toServerSentEventsResponse(stream);
});
```

## contentGuardMiddleware

Filters or transforms streamed text content as it flows through `onChunk`. Use it to redact sensitive data (SSNs, emails, API keys), enforce a profanity filter, or rewrite text on the fly. Rules are applied to `TEXT_MESSAGE_CONTENT` chunks; all other chunk types pass through untouched.

```typescript
import { chat } from "@tanstack/ai";
import { contentGuardMiddleware } from "@tanstack/ai/middlewares";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  middleware: [
    contentGuardMiddleware({
      rules: [
        // Regex + replacement
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN REDACTED]" },
        // Custom transform function
        { fn: (text) => text.replaceAll("badword", "****") },
      ],
      strategy: "buffered",
    }),
  ],
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rules` | `ContentGuardRule[]` | — | **Required.** Applied in order; each rule receives the previous rule's output. A rule is either `{ pattern: RegExp; replacement: string }` or `{ fn: (text: string) => string }`. |
| `strategy` | `'delta' \| 'buffered'` | `'buffered'` | How content is matched. See below. |
| `bufferSize` | `number` | `50` | (Buffered only) Characters held back before emitting, so patterns spanning chunk boundaries still match. Set it ≥ the longest pattern you expect. Flushed at stream end. |
| `blockOnMatch` | `boolean` | `false` | When `true`, drop the entire chunk if any rule changes the content (instead of emitting the filtered version). |
| `onFiltered` | `(info: ContentFilteredInfo) => void` | — | Callback fired whenever a rule changes content. Receives `{ messageId, original, filtered, strategy }`. |

**Matching strategies:**

- **`'buffered'` (default)** — Accumulates content and applies rules to the settled portion, holding back a `bufferSize` look-behind window so a pattern split across two chunks (`"...123-45"` then `"-6789..."`) is still caught. The buffer is flushed when the message or run ends. Use this for anything that can span deltas — which is most redaction.
- **`'delta'`** — Applies rules to each delta in isolation as it arrives. Fastest and lowest-latency, but a pattern split across a chunk boundary may slip through. Use only when your patterns are guaranteed to fit within a single delta.

**Behaviors:**

- Only `TEXT_MESSAGE_CONTENT` chunks are inspected; every other chunk type passes through.
- A rule that doesn't change the text is a no-op — the chunk passes through unchanged.
- With `blockOnMatch: true`, a matched chunk is dropped entirely (returns `null` from `onChunk`) rather than emitting the redacted text.
- The `onFiltered` callback is for observability/audit — it fires with the before/after text but does not alter what is emitted.

## otelMiddleware

Emits vendor-neutral OpenTelemetry traces and metrics for every `chat()` call — a root span per call, a child span per agent-loop iteration, and a grandchild span per tool execution, all tagged with [GenAI semantic-convention attributes](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

```typescript
import { chat } from "@tanstack/ai";
import { otelMiddleware } from "@tanstack/ai/middlewares/otel";
import { trace, metrics } from "@opentelemetry/api";

const otel = otelMiddleware({
  tracer: trace.getTracer("my-app"),
  meter: metrics.getMeter("my-app"), // optional — enables GenAI histograms
});

const result = await chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  middleware: [otel],
});
```

`otelMiddleware` has its own configuration surface (content capture, redaction, span-name formatting, attribute enrichment, lifecycle callbacks) and requires the optional `@opentelemetry/api` peer dependency. See the dedicated [OpenTelemetry](./otel) guide for full setup, the span/metric catalogue, and all options.

## Writing your own

These built-ins are just `ChatMiddleware` objects — nothing about them is privileged. To build your own, see the [Middleware](./middleware) guide for the full hook reference, the context object, and composition rules.

## Next Steps

- [Middleware](./middleware) — the full lifecycle and hook reference
- [OpenTelemetry](./otel) — `otelMiddleware` in depth