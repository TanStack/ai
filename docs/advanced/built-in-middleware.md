---
title: Built-in Middleware
id: built-in-middleware
order: 2
description: "Drop-in chat() middleware — toolCacheMiddleware, contentGuardMiddleware, otelMiddleware."
keywords:
  - tanstack ai
  - middleware
  - built-in middleware
  - tool cache
  - content guard
  - redaction
  - opentelemetry
---

If you need caching, redaction, or OTel → pass one of these into `chat({ middleware })`. Each is a normal [`ChatMiddleware`](./middleware).

| Middleware | Import | Role |
|------------|--------|------|
| `toolCacheMiddleware` | `@tanstack/ai/middlewares` | Cache tool results by name + args |
| `contentGuardMiddleware` | `@tanstack/ai/middlewares` | Redact / transform / block text chunks |
| `otelMiddleware` | `@tanstack/ai/middlewares/otel` | OpenTelemetry spans + GenAI metrics |

`otelMiddleware` is on its own subpath so the barrel never pulls `@opentelemetry/api` (optional peer).

App-owned policies (tool-call budgets, etc.) stay in your code — see the [tool-call budget recipe](../chat/agentic-cycle#tool-call-budgets-middleware-recipe).

## toolCacheMiddleware

Skip re-running a tool when name + args match a prior successful call.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";
import { weatherTool, stockTool } from "./tools";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool, stockTool],
  middleware: [
    toolCacheMiddleware({
      ttl: 60_000,
      maxSize: 50,
      toolNames: ["getWeather"],
    }),
  ],
});
```

### Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `maxSize` | `number` | `100` | LRU cap (default in-memory only) |
| `ttl` | `number` | `Infinity` | ms; expired entries not served |
| `toolNames` | `string[]` | all tools | Others pass through |
| `keyFn` | `(toolName, args) => string` | `JSON.stringify([toolName, args])` | Custom key |
| `storage` | `ToolCacheStorage` | in-memory Map | Custom backend; ignores `maxSize` |

### Behavior

1. Only successful calls are cached (errors never stored).
2. Hits return `{ type: 'skip', result }` via `onBeforeToolCall`.
3. LRU: at `maxSize`, oldest drops; hits move to most-recent.

### Custom key

```typescript
import { toolCacheMiddleware } from "@tanstack/ai/middlewares";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

toolCacheMiddleware({
  keyFn: (toolName, args) => {
    if (!isRecord(args)) return JSON.stringify([toolName, args]);
    const { page, ...rest } = args;
    return JSON.stringify([toolName, rest]);
  },
});
```

### Custom storage

Default cache is per-instance in-memory. Pass `storage` for Redis, localStorage, DB, or a shared Map across `chat()` calls.

```typescript
import { type ToolCacheEntry, type ToolCacheStorage } from "@tanstack/ai/middlewares";

// ToolCacheEntry = { result: unknown; timestamp: number }
interface MyStorage extends ToolCacheStorage {
  getItem: (key: string) => ToolCacheEntry | undefined | Promise<ToolCacheEntry | undefined>;
  setItem: (key: string, value: ToolCacheEntry) => void | Promise<void>;
  deleteItem: (key: string) => void | Promise<void>;
}
```

Methods may be async. Middleware handles TTL; storage only stores/retrieves.

**Redis:**

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

**Share across requests:**

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { toolCacheMiddleware, type ToolCacheStorage } from "@tanstack/ai/middlewares";
import { globalCache, app, adapter } from "./server";
import { weatherTool } from "./tools";

const sharedStorage: ToolCacheStorage = {
  getItem: (key) => globalCache.get(key),
  setItem: (key, value) => {
    globalCache.set(key, value);
  },
  deleteItem: (key) => {
    globalCache.delete(key);
  },
};

app.post("/api/chat", async (req: { body: { messages: unknown[] } }) => {
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

Filter or rewrite streamed text in `onChunk`. Targets `TEXT_MESSAGE_CONTENT` only; other chunk types pass through.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { contentGuardMiddleware } from "@tanstack/ai/middlewares";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Tell me about customer 123-45-6789" }],
  middleware: [
    contentGuardMiddleware({
      rules: [
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN REDACTED]" },
        { fn: (text) => text.replaceAll("badword", "****") },
      ],
      strategy: "buffered",
    }),
  ],
});
```

### Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `rules` | `ContentGuardRule[]` | — | **Required.** In order; each gets previous output. Rule = `{ pattern, replacement }` or `{ fn }` |
| `strategy` | `'delta' \| 'buffered'` | `'buffered'` | See below |
| `bufferSize` | `number` | `50` | Buffered only; look-behind so cross-chunk patterns match. ≥ longest pattern |
| `blockOnMatch` | `boolean` | `false` | Drop whole chunk if any rule changes content |
| `onFiltered` | `(info) => void` | — | Observability: `{ messageId, original, filtered, strategy }` |

### Strategies

| Strategy | Use when |
|----------|----------|
| `'buffered'` (default) | Patterns can span deltas (most redaction). Holds `bufferSize` chars; flushes at message/run end |
| `'delta'` | Patterns always fit one delta; lowest latency. Split patterns can slip through |

### Behavior

1. Non-matching rules are no-ops.
2. `blockOnMatch: true` → return `null` from `onChunk` (drop), not redacted text.
3. `onFiltered` does not change what is emitted.

## otelMiddleware

Root span per call, child per agent-loop iteration, grandchild per tool — [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { otelMiddleware } from "@tanstack/ai/middlewares/otel";
import { trace, metrics } from "@opentelemetry/api";
import { messages } from "./server";

const otel = otelMiddleware({
  tracer: trace.getTracer("my-app"),
  meter: metrics.getMeter("my-app"), // optional GenAI histograms
});

const result = await chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  middleware: [otel],
});
```

Full options, span/metric catalogue, privacy: [OpenTelemetry](./otel).

## Write your own

Built-ins are plain `ChatMiddleware`. Hook reference and composition: [Middleware](./middleware).

## Related

- [Middleware](./middleware) — lifecycle + hooks
- [OpenTelemetry](./otel) — `otelMiddleware` in depth
