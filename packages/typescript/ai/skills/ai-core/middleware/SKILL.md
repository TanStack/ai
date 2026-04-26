---
name: ai-core/middleware
description: >
  Chat lifecycle middleware hooks: onConfig, onStart, onChunk,
  onBeforeToolCall, onAfterToolCall, onUsage, onFinish, onAbort, onError.
  Use for analytics, event firing, tool caching (toolCacheMiddleware),
  logging, and tracing. Middleware array in chat() config, left-to-right
  execution order. NOT onEnd/onFinish callbacks on chat() — use middleware.
type: sub-skill
library: tanstack-ai
library_version: '0.10.0'
sources:
  - 'TanStack/ai:docs/advanced/middleware.md'
---

# Middleware

> **Dependency note:** This skill builds on ai-core. Read it first for critical rules.

## Setup — Analytics Tracking Middleware

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  middleware: [
    {
      onStart: (ctx) => {
        console.log('Chat started:', ctx.model)
      },
      onFinish: (ctx) => {
        trackAnalytics({ model: ctx.model, tokens: ctx.usage })
      },
      onError: (ctx) => {
        reportError(ctx.error)
      },
    },
  ],
})

return toServerSentEventsResponse(stream)
```

## Hooks Reference

Every hook receives a `ChatMiddlewareContext` as its first argument, which provides
`requestId`, `streamId`, `phase`, `iteration`, `chunkIndex`, `model`, `provider`,
`signal`, `abort()`, `defer()`, and more.

| Hook                  | When                                                          | Second Argument                                  |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `onConfig`            | Once at startup (`init`) + once per iteration (`beforeModel`) | `ChatMiddlewareConfig` (return partial to merge) |
| `onStart`             | Once after initial `onConfig`                                 | none                                             |
| `onIteration`         | Start of each agent loop iteration                            | `IterationInfo`                                  |
| `onChunk`             | Every streamed chunk                                          | `StreamChunk` (return void/chunk/chunk[]/null)   |
| `onBeforeToolCall`    | Before each tool executes                                     | `ToolCallHookContext` (return decision or void)  |
| `onAfterToolCall`     | After each tool executes                                      | `AfterToolCallInfo`                              |
| `onToolPhaseComplete` | After all tool calls in an iteration                          | `ToolPhaseCompleteInfo`                          |
| `onUsage`             | When `RUN_FINISHED` includes usage data                       | `UsageInfo`                                      |
| `onFinish`            | Run completed normally                                        | `FinishInfo`                                     |
| `onAbort`             | Run was aborted                                               | `AbortInfo`                                      |
| `onError`             | Unhandled error occurred                                      | `ErrorInfo`                                      |

Terminal hooks (`onFinish`, `onAbort`, `onError`) are **mutually exclusive** -- exactly
one fires per `chat()` invocation.

## Core Patterns

### Pattern 1: Analytics and Logging Middleware

Use `onStart`, `onFinish`, `onUsage`, and `onError` for comprehensive observability.
Use `ctx.defer()` for non-blocking async side effects that should not block the stream.

```typescript
import {
  chat,
  toServerSentEventsResponse,
  type ChatMiddleware,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const analytics: ChatMiddleware = {
  name: 'analytics',
  onStart: (ctx) => {
    console.log(`[${ctx.requestId}] Chat started — model: ${ctx.model}`)
  },
  onUsage: (ctx, usage) => {
    console.log(`[${ctx.requestId}] Tokens: ${usage.totalTokens}`)
  },
  onFinish: (ctx, info) => {
    ctx.defer(
      fetch('/api/analytics', {
        method: 'POST',
        body: JSON.stringify({
          requestId: ctx.requestId,
          model: ctx.model,
          duration: info.duration,
          tokens: info.usage?.totalTokens,
          finishReason: info.finishReason,
        }),
      }),
    )
  },
  onError: (ctx, info) => {
    ctx.defer(
      fetch('/api/errors', {
        method: 'POST',
        body: JSON.stringify({
          requestId: ctx.requestId,
          error: String(info.error),
          duration: info.duration,
        }),
      }),
    )
  },
}

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  middleware: [analytics],
})

return toServerSentEventsResponse(stream)
```

### Pattern 2: Tool Interception Middleware

Use `onBeforeToolCall` to validate, gate, or transform tool arguments before execution.
Use `onAfterToolCall` to log results and timing. The first middleware that returns a
non-void decision from `onBeforeToolCall` short-circuits remaining middleware for that call.

```typescript
import type { ChatMiddleware } from '@tanstack/ai'

const toolGuard: ChatMiddleware = {
  name: 'tool-guard',
  onBeforeToolCall: (ctx, hookCtx) => {
    // Block dangerous tools
    if (hookCtx.toolName === 'deleteDatabase') {
      return { type: 'abort', reason: 'Dangerous operation blocked' }
    }

    // Enforce default arguments
    if (hookCtx.toolName === 'search' && !hookCtx.args.limit) {
      return {
        type: 'transformArgs',
        args: { ...hookCtx.args, limit: 10 },
      }
    }

    // Return void to continue normally
  },
  onAfterToolCall: (ctx, info) => {
    if (info.ok) {
      console.log(`${info.toolName} completed in ${info.duration}ms`)
    } else {
      console.error(`${info.toolName} failed:`, info.error)
    }
  },
}
```

**`onBeforeToolCall` decision types:**

| Decision                          | Effect                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `void` / `undefined`              | Continue normally, next middleware decides                          |
| `{ type: 'transformArgs', args }` | Replace tool arguments before execution                             |
| `{ type: 'skip', result }`        | Skip execution, use provided result (used by `toolCacheMiddleware`) |
| `{ type: 'abort', reason? }`      | Abort the entire chat run                                           |

### Pattern 3: Multiple Middleware Composition

Middleware executes in array order (left-to-right). Ordering matters for hooks that
pipe or short-circuit:

```typescript
import { chat, type ChatMiddleware } from '@tanstack/ai'
import { toolCacheMiddleware } from '@tanstack/ai/middlewares'
import { openaiText } from '@tanstack/ai-openai'

const logging: ChatMiddleware = {
  name: 'logging',
  onStart: (ctx) => console.log(`[${ctx.requestId}] started`),
  onChunk: (ctx, chunk) => {
    console.log(`[${ctx.requestId}] chunk: ${chunk.type}`)
  },
  onFinish: (ctx, info) => {
    console.log(`[${ctx.requestId}] done in ${info.duration}ms`)
  },
}

const configTransform: ChatMiddleware = {
  name: 'config-transform',
  onConfig: (ctx, config) => {
    if (ctx.phase === 'init') {
      return {
        systemPrompts: [...config.systemPrompts, 'Always respond in JSON.'],
      }
    }
  },
}

const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  tools: [weatherTool, stockTool],
  middleware: [
    logging, // Runs first
    configTransform, // Transforms config second
    toolCacheMiddleware({ ttl: 60_000 }), // Caches tool results third
  ],
})
```

**Composition rules by hook:**

| Hook                       | Composition                                   | Effect of Order                            |
| -------------------------- | --------------------------------------------- | ------------------------------------------ |
| `onConfig`                 | **Piped** -- each receives previous output    | Earlier middleware transforms first        |
| `onStart`                  | Sequential                                    | All run in order                           |
| `onChunk`                  | **Piped** -- chunks flow through each         | If first drops a chunk, later never see it |
| `onBeforeToolCall`         | **First-win** -- first non-void decision wins | Earlier middleware has priority            |
| `onAfterToolCall`          | Sequential                                    | All run in order                           |
| `onUsage`                  | Sequential                                    | All run in order                           |
| `onFinish/onAbort/onError` | Sequential                                    | All run in order                           |

## Built-in: toolCacheMiddleware

Caches tool call results by name + arguments. Import from `@tanstack/ai/middlewares`:

```typescript
import { chat } from '@tanstack/ai'
import { toolCacheMiddleware } from '@tanstack/ai/middlewares'

const stream = chat({
  adapter,
  messages,
  tools: [weatherTool],
  middleware: [
    toolCacheMiddleware({
      ttl: 60_000, // Cache entries expire after 60 seconds
      maxSize: 50, // Max 50 entries (LRU eviction)
      toolNames: ['getWeather'], // Only cache specific tools
    }),
  ],
})
```

Options: `maxSize` (default 100), `ttl` (default Infinity), `toolNames` (default all),
`keyFn` (custom cache key), `storage` (custom backend like Redis). See
`docs/advanced/middleware.md` for custom storage examples.

## Common Mistakes

### a. MEDIUM: Trying to modify StreamChunks in middleware

```typescript
// WRONG -- mutating the chunk object directly
const broken: ChatMiddleware = {
  name: 'broken',
  onChunk: (ctx, chunk) => {
    chunk.delta = 'modified' // Mutation does nothing; chunk is not modified in-place
  },
}

// CORRECT -- return a new chunk to replace the original
const correct: ChatMiddleware = {
  name: 'correct',
  onChunk: (ctx, chunk) => {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      return { ...chunk, delta: chunk.delta.replace(/secret/g, '[REDACTED]') }
    }
    // Return void to pass through unchanged
  },
}
```

Middleware `onChunk` hooks are functional transforms. Return a new chunk, an array
of chunks, null (to drop), or void (to pass through). Mutating the input object
has no effect on the stream output.

Source: docs/advanced/middleware.md

### b. MEDIUM: Middleware exceptions breaking the stream

```typescript
// WRONG -- unhandled error kills the entire streaming response
const fragile: ChatMiddleware = {
  name: 'fragile-analytics',
  onFinish: async (ctx, info) => {
    // If this fetch fails, the stream breaks
    await fetch('/api/analytics', {
      method: 'POST',
      body: JSON.stringify({ duration: info.duration }),
    })
  },
}

// CORRECT -- wrap in try-catch and/or use ctx.defer()
const resilient: ChatMiddleware = {
  name: 'resilient-analytics',
  onFinish: (ctx, info) => {
    // Option 1: defer (non-blocking, errors are isolated)
    ctx.defer(
      fetch('/api/analytics', {
        method: 'POST',
        body: JSON.stringify({ duration: info.duration }),
      }),
    )
  },
  onChunk: (ctx, chunk) => {
    // Option 2: try-catch for synchronous/critical hooks
    try {
      logChunk(chunk)
    } catch (err) {
      console.error('Logging failed:', err)
    }
    // Return void to pass through
  },
}
```

Wrap all middleware hooks in try-catch to prevent analytics or logging failures
from killing the chat stream. For async side effects, prefer `ctx.defer()` which
runs after the terminal hook and isolates failures.

Source: docs/advanced/middleware.md

## Cross-References

- See also: **ai-core/chat-experience/SKILL.md** -- Middleware hooks into the chat lifecycle
