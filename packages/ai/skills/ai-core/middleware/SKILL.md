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
  - 'TanStack/ai:docs/sandbox/observability.md'
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
      onFinish: (ctx, info) => {
        trackAnalytics({ model: ctx.model, tokens: info.usage?.totalTokens })
      },
      onError: (ctx, info) => {
        reportError(info.error)
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

| Hook                       | When                                                                                               | Second Argument                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `onConfig`                 | Once at startup (`init`) + once per iteration (`beforeModel`) + once at structured-output boundary | `ChatMiddlewareConfig` (return partial to merge)    |
| `onStructuredOutputConfig` | Once at the structured-output boundary (only when `chat({ outputSchema })`)                        | `StructuredOutputMiddlewareConfig` (return partial) |
| `onStart`                  | Once after initial `onConfig`                                                                      | none                                                |
| `onIteration`              | Start of each agent loop iteration                                                                 | `IterationInfo`                                     |
| `onChunk`                  | Every streamed chunk                                                                               | `StreamChunk` (return void/chunk/chunk[]/null)      |
| `onBeforeToolCall`         | Before each tool executes                                                                          | `ToolCallHookContext` (return decision or void)     |
| `onAfterToolCall`          | After each tool executes                                                                           | `AfterToolCallInfo`                                 |
| `onToolPhaseComplete`      | After all tool calls in an iteration                                                               | `ToolPhaseCompleteInfo`                             |
| `onUsage`                  | When `RUN_FINISHED` includes usage data                                                            | `UsageInfo`                                         |
| `onFinish`                 | Run completed normally                                                                             | `FinishInfo`                                        |
| `onAbort`                  | Run was aborted                                                                                    | `AbortInfo`                                         |
| `onError`                  | Unhandled error occurred                                                                           | `ErrorInfo`                                         |

Terminal hooks (`onFinish`, `onAbort`, `onError`) are **mutually exclusive** -- exactly
one fires per `chat()` invocation.

> **Sampling in `onConfig`:** `temperature`, `topP`, and `maxTokens` are **not**
> first-class fields on `ChatMiddlewareConfig`. To adjust sampling from
> middleware, return a partial that mutates `config.modelOptions` using the
> provider's native key (e.g. OpenAI `temperature` / `max_output_tokens`,
> Anthropic `max_tokens`, Ollama nested `options.num_predict`). Returning a
> top-level `temperature`/`maxTokens` has no effect.

### Phase values

`ctx.phase` is one of:

| Phase                | When                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'init'`             | Initial setup (before the first `onConfig` snapshot is built).                                                                                                                                                                                 |
| `'beforeModel'`      | Right before each agent-loop adapter call (`onConfig` re-fires here).                                                                                                                                                                          |
| `'modelStream'`      | During model streaming chunks within the agent loop.                                                                                                                                                                                           |
| `'beforeTools'`      | Before tool execution phase.                                                                                                                                                                                                                   |
| `'afterTools'`       | After tool execution phase.                                                                                                                                                                                                                    |
| `'structuredOutput'` | During the final structured-output adapter call (set for all chunks from `adapter.structuredOutputStream` or the synthesized fallback). Triggered only when `chat({ outputSchema })` is invoked; one phase transition per `chat()` invocation. |

**Structured-output lifecycle rules** (when `chat({ outputSchema })` is used):

- `onStructuredOutputConfig` fires **before** `onConfig` at the structured-output boundary.
- `onConfig` re-fires at the same boundary with `ctx.phase === 'structuredOutput'`, receiving the post-`onStructuredOutputConfig` view of the config (minus `outputSchema`).
- `onChunk` and `onUsage` fire for every chunk and usage event emitted by the structured-output call, with `ctx.phase === 'structuredOutput'`.
- `onIteration` does **not** fire for finalization — it is agent-loop-only.
- `onFinish` fires once at the end of the whole `chat()` invocation, **after** the structured-output finalization completes (not after the agent loop). Terminal-hook exclusivity still holds (one of `onFinish` / `onAbort` / `onError`).
- **Terminal `info` and structured-output:** `info.usage` / `info.finishReason` / `info.content` reflect the **agent loop's** terminal state, NOT the finalization step. Finalization state is intentionally segregated to keep agent-loop semantics clean. For a tools-less `chat({ outputSchema })` run, `info.usage` is `undefined` and `info.finishReason` is `null` (no agent-loop iteration produced `RUN_FINISHED`). To capture finalization tokens, use `onUsage` — it fires for both agent-loop iterations and the final call. For the structured-output result itself, observe the `structured-output.complete` CUSTOM event in `onChunk`.

## onStructuredOutputConfig

A dedicated config hook that fires **only** at the structured-output boundary
(when `chat({ outputSchema })` is invoked). Use it to transform the JSON Schema
sent to the provider (inject `$defs`, strip vendor-incompatible keywords) or to
apply structured-output-specific config changes that should not affect the
agent-loop adapter calls.

**Signature:**

```ts
onStructuredOutputConfig?: (
  ctx: ChatMiddlewareContext,
  config: StructuredOutputMiddlewareConfig,
) =>
  | void
  | null
  | Partial<StructuredOutputMiddlewareConfig>
  | Promise<void | Partial<StructuredOutputMiddlewareConfig>>
```

**`StructuredOutputMiddlewareConfig` shape:**

```ts
interface StructuredOutputMiddlewareConfig extends ChatMiddlewareConfig {
  outputSchema: JSONSchema // The JSON Schema being sent to the provider
}
```

**Ordering rule:**

- `onStructuredOutputConfig` fires **before** `onConfig` at the structured-output boundary.
- `onConfig` re-fires at the same boundary with `ctx.phase === 'structuredOutput'`, receiving the post-`onStructuredOutputConfig` view of the config (minus `outputSchema`).
- Use `onConfig` for general-purpose transforms that apply to every adapter call (agent-loop iterations and the final structured-output call).
- Use `onStructuredOutputConfig` when you need to transform the JSON Schema or apply structured-output-specific behavior.

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

### Pattern 3: Structured-Output Middleware

When `chat({ outputSchema })` is used, the final structured-output adapter call
now flows through the same middleware chain as the agent loop (with
`ctx.phase === 'structuredOutput'`). Before this change, the final call bypassed
middleware entirely — `onChunk`, `onUsage`, `onConfig`, and terminal hooks did
not see it.

**Example A — Observability (tracing every chunk, including finalization):**

```typescript
import type { ChatMiddleware } from '@tanstack/ai'

const tracing: ChatMiddleware = {
  name: 'tracing',
  onChunk(ctx, chunk) {
    span.addEvent('chunk', { phase: ctx.phase, type: chunk.type })
  },
}
```

This middleware now observes every chunk from the final structured-output call,
attributed to `ctx.phase === 'structuredOutput'`. Before the fix, the final
adapter call bypassed middleware entirely — `tracing` would only see agent-loop
chunks.

**Example B — Schema rewriting (inject shared `$defs`):**

```typescript
import type { ChatMiddleware } from '@tanstack/ai'

const injectDefs: ChatMiddleware = {
  name: 'inject-defs',
  onStructuredOutputConfig(_ctx, config) {
    return {
      outputSchema: { ...config.outputSchema, $defs: { ...sharedDefs } },
    }
  },
}
```

`onStructuredOutputConfig` is the right hook here because it has direct access
to `config.outputSchema` and runs only on the structured-output boundary —
schema rewrites do not leak into the agent-loop adapter calls.

### Pattern 4: Multiple Middleware Composition

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
        // Sampling options are NOT first-class config fields — mutate them
        // through `config.modelOptions` using the provider's native key.
        // (e.g. OpenAI `temperature` / `max_output_tokens`.)
        modelOptions: { ...config.modelOptions, temperature: 0.2 },
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
| `onStructuredOutputConfig` | **Piped** -- each receives previous output    | Earlier middleware transforms first        |
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

## Sandbox File-Event Hooks (`sandbox` group)

Declare a `sandbox: ChatSandboxHooks` group on `defineChatMiddleware` to react
to every file created/changed/deleted inside a sandbox provided by
`withSandbox` (from `@tanstack/ai-sandbox`). These fire **per-run**,
server-side, and each handler receives the run's `ChatMiddlewareContext` as
the first argument:

```typescript
import { defineChatMiddleware } from '@tanstack/ai'
import { db } from './db'

const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFile: (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
  },
})
```

| Hook           | Fires for                  |
| -------------- | -------------------------- |
| `onFile`       | Every create/change/delete |
| `onFileCreate` | File creates only          |
| `onFileChange` | File changes only          |
| `onFileDelete` | File deletes only          |

These are independent of the stream: the engine also emits a `sandbox.file`
`CUSTOM` chunk per change regardless of whether any `sandbox` hooks are
registered, so a client can react to the same edits without middleware. See
`ai-core/ag-ui-protocol/SKILL.md` for reading that chunk (and the opt-in
`sandbox.file.diff` chunk) off `ChatStream`.

### `before()` / `after()` / `diff()` — lazy, git-backed content accessors

Each hook receives a `SandboxFileHookEvent`: the serializable
`{ type, path, timestamp }` plus three lazy accessors for the file's content:

```ts
interface SandboxFileHookEvent {
  type: 'create' | 'change' | 'delete'
  path: string
  timestamp: number
  before(): Promise<string> // content at the session baseline ('' if new / non-git)
  after(): Promise<string> // current content ('' if deleted)
  diff(): Promise<string> // unified patch vs the baseline
}
```

```typescript
import { defineChatMiddleware } from '@tanstack/ai'
import { db } from './db'

const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFileChange: async (ctx, e) => {
      const [before, after] = await Promise.all([e.before(), e.after()])
      db.log({ run: ctx.runId, path: e.path, before, after })
    },
  },
})
```

**Lazy — path-only hooks pay nothing.** `before()`, `after()`, and `diff()`
are methods, not fields: each only reads the file or shells out to `git` when
called. A hook that only reads `e.path`/`e.type` (like the `onFile` logger
above) never touches the filesystem or spawns a process.

**Git session baseline.** The sandbox snapshots `git rev-parse HEAD` once at
setup as the session baseline (empty string if the workspace isn't a git repo
or has no commits). `before()` and `diff()` always diff against that same
fixed baseline for the rest of the run, so `onFileChange` reports the file's
**cumulative** change since the run started, not just the delta since the
last poll. `after()` always reads current on-disk content. None of the three
accessors throw: a deleted file resolves `after()` to `''` (it still has
`before()`); a new file resolves `before()` to `''` (it still has `after()`);
a non-git workspace resolves **both** `before()` and `after()` to `''` and
makes `diff()` fall back to a synthesized add-patch built from `after()` —
except for a `delete` event in a non-git workspace, where there's nothing to
synthesize and `diff()` resolves to `''`.

**Hook errors are swallowed per hook.** A throwing `sandbox` hook is caught
and logged under the `sandbox` debug category — it cannot break the run or
stop other hooks (or the `sandbox.file` chunk) from continuing.

Source: docs/sandbox/observability.md

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
- See also: **ai-core/structured-outputs/SKILL.md** -- Middleware now wraps the final structured-output call; use `onStructuredOutputConfig` for JSON-Schema transforms
- See also: **ai-core/ag-ui-protocol/SKILL.md** -- Reading the `sandbox.file` / `sandbox.file.diff` `CUSTOM` chunks the sandbox runtime emits alongside these `sandbox` hooks, via `ChatStream`'s typed `KnownCustomEvent` narrowing
