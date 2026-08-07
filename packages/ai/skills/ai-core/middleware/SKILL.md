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
library_version: '0.42.0'
sources:
  - 'TanStack/ai:docs/advanced/middleware.md'
  - 'TanStack/ai:docs/sandbox/observability.md'
  - 'TanStack/ai:docs/persistence/overview.md'
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
| `onShouldContinue`         | Whether to start another agent-loop iteration (AND with strategy; `false` stops)                   | `AgentLoopState`                                    |
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
  | Promise<void | null | Partial<StructuredOutputMiddlewareConfig>>
```

**`StructuredOutputMiddlewareConfig` shape:**

```ts
interface StructuredOutputMiddlewareConfig extends Omit<
  ChatMiddlewareConfig,
  'tools'
> {
  outputSchema: JSONSchema // The JSON Schema being sent to the provider
}
```

Note the `Omit<…, 'tools'>`: there is **no `config.tools`** on this hook. The
structured-output call is the final, tool-free call, so reading or returning
`tools` here is a compile error, not a no-op. Transform tools in `onConfig`
instead.

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

    // Enforce default arguments. `hookCtx.args` is `unknown` — the provider
    // sent it — so narrow before reading it. No `as` casts.
    if (hookCtx.toolName === 'search') {
      const args =
        typeof hookCtx.args === 'object' && hookCtx.args !== null
          ? hookCtx.args
          : {}
      if (!('limit' in args)) {
        return {
          type: 'transformArgs',
          args: { ...args, limit: 10 },
        }
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

## Pattern: tool-call budget (app-owned)

Not a built-in. Cap fan-out with `onBeforeToolCall` skip + `onShouldContinue`.
See `docs/chat/agentic-cycle.md` ("Tool-call budgets").

```typescript
import { chat, maxIterations, type ChatMiddleware } from '@tanstack/ai'

function toolCallBudget(opts: {
  max?: number
  maxPerTurn?: number
}): ChatMiddleware {
  let perTurn = 0
  return {
    onIteration: () => {
      perTurn = 0
    },
    onToolPhaseComplete: () => {
      perTurn = 0
    },
    onBeforeToolCall: () => {
      if (opts.maxPerTurn == null) return undefined
      if (++perTurn > opts.maxPerTurn) {
        return {
          type: 'skip',
          result: {
            error: `Skipped: exceeded maxToolCallsPerTurn (${opts.maxPerTurn})`,
          },
        }
      }
      return undefined
    },
    onShouldContinue: (_ctx, state) =>
      opts.max != null && state.toolCallCount >= opts.max ? false : undefined,
  }
}

chat({
  adapter,
  messages,
  tools: [weatherTool],
  agentLoopStrategy: maxIterations(20),
  middleware: [toolCallBudget({ maxPerTurn: 10, max: 20 })],
})
```

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

## Server State Persistence: withPersistence

`withPersistence(persistence)` (from `@tanstack/ai-persistence`) is a
`ChatMiddleware` that persists **state** for `chat()` — thread messages, run
records (status/timing/usage/errors), and interrupt state — to a backend store.
Add it to the `middleware` array like any other middleware. It never mutates the
chunk stream; replaying a dropped/reloaded _stream_ is a separate transport-layer
concern (see ai-core/chat-experience/SKILL.md resumability, not this middleware).

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'

// memoryPersistence() is the in-process reference backend (dev/tests). For a
// durable one, implement the store contracts against your database — see the
// @tanstack/ai-persistence skills.
const persistence = memoryPersistence()

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

### Authoritative-history contract

The middleware treats each request's `messages` as the source of truth for the
thread:

- **Non-empty `messages`** → on a successful finish (and at an interrupt
  boundary) the middleware **overwrites** the entire stored thread with that
  array. Post the **complete** transcript, never just the newest message(s) — a
  delta would replace and destroy the stored history.
- **Empty `messages`** → the middleware **loads** the stored thread and runs the
  turn from the server's copy. This is how you continue a conversation without
  resending history from the client.

### Backends

`@tanstack/ai-persistence` ships **contracts, not a database backend**. It
provides the four store interfaces (`messages`, `runs`, `interrupts`,
`metadata`), the middleware that drives them, `memoryPersistence()` for
dev/tests, and a conformance testkit. For anything durable you implement the
stores against your own database and pass the result to `withPersistence`.

Annotate your factory with a named shape (`ChatPersistence` /
`ChatTranscriptPersistence`) — bare `AIPersistence` is the all-optional bag and
`withPersistence` rejects it.

Locks are separate from state and are **not** a `stores` key: wire a
`LockStore` with `withLocks(lockStore)`.

The `runs` store in that list is typed against `RunStore`, which ships in
`@tanstack/ai` alongside `RunRecord`, `RunStatus`, `TerminalRunStatus`,
`RunError`, `isTerminalRunStatus`, `defineRunStore`, and `InMemoryRunStore`. A
`RunRecord` tracks one run: `runId`, `threadId`, `status`, `startedAt`, plus
optional `finishedAt`, `error`, `usage`, `sandboxKey`, `detachedSince`,
`cancelRequested`, and `driverEpoch`. A backend must round-trip **all** of
them: `cancelRequested` is the durable out-of-band cancel channel
(`requestRunCancel` writes it, `wasCancelRequested` reads it), and
`driverEpoch` is the monotonic fencing token each host bumps when it claims a
run, so a superseded host can discover it lost. Omit either and a durable
sandboxed run loses a mechanism silently — Stop stops reaching a remote
driver, or nothing fences a dead host's writes.
`error` is a structured `RunError` (`{ message: string, code?: string }`), not
a bare string: `message` is the provider's prose, `code` is the stable,
machine-branchable classification a consumer switches on. Only
`createOrResume`, `update`, `get`, and `findActiveRun` are required on a
`RunStore`; `listByThread` and `listReclaimable` are optional, so a backend can
leave either out and callers feature-detect
(`store.listReclaimable?.(opts)`). Shape your own store with
`defineRunStore` for autocomplete without a separate `: RunStore` annotation,
matching `defineLock`; `defineRunStore<const T extends RunStore>(store: T): T`
returns the argument's own type, so an optional method your store implements
stays known-present on the result instead of collapsing to `| undefined`.
`isTerminalRunStatus(status)` is a type predicate narrowing `RunStatus` to
`TerminalRunStatus`, so code inside the guard can pass `status` where a
`TerminalRunStatus` is required without a cast. When a backend omits an
optional `RunStore` method, declare the omission when running the conformance
testkit (`ai-persistence/stores`'s `skipMethods` option) rather than leaving it
undeclared.

### `StreamDurability.snapshot()`

A `StreamDurability` (the event-log backend `memoryStream` / `durableStream`
implement, and what `@tanstack/ai-sandbox`'s run driver resolves per run — its
`RunDeps.durability` / `sandboxRunDriver({ durability })` is a factory
`(runId) => StreamDurability`, because one log is bound to one run) requires a
`snapshot()` method alongside `append`, `read`, and `close`:

```ts
snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
```

It returns everything stored for a run right now, in append order, then
resolves. Use it, not `read()`, when a caller needs to inspect a run's stored
prefix and get an answer back: `read()` tails and only resolves once the log
is terminalized with `close()` or the caller aborts, so it never resolves
against a producer that crashed without calling `close()`, and its log stays
open indefinitely. `snapshot()` resolves immediately with what is stored,
including while the log is still open, and resolves to an empty array for a
run with nothing stored yet.

**Full guidance lives in the package's own skills** — start at
`node_modules/@tanstack/ai-persistence/skills/ai-persistence/SKILL.md`,
which routes to the server, client, stores, locks, and adapter-recipe
(Drizzle / Prisma / Cloudflare) sub-skills.

### Resume reconstruction is the middleware's job (server-authoritative path)

When a thread has pending interrupts, the middleware **records** them and
**gates** new input: a request that carries pending interrupts must include a
`resume` batch that references them, or `onConfig` throws. On a valid resume
batch the middleware also **builds `ChatResumeToolState`** (approvals /
client-tool results) and **clears `config.resume`** so the chat engine skips
its ephemeral reconstruction — that path needs client message history the
persistence flow deliberately omits when the server owns the transcript.
Resumes accepted in `onConfig` are committed (marked resolved/cancelled) only
once the run reaches a successful boundary, so a provider failure between
accepting a resume and finishing leaves the interrupt pending and a retry with
the same resume succeeds.

> A companion `withGenerationPersistence(persistence)` tracks run records for
> non-chat generation activities (image, audio, TTS, video, transcription).

Source: docs/persistence/overview.md

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
synthesize and `diff()` resolves to `''`. In a git workspace a file git
**isn't tracking yet** (a file the agent created, and every later edit to it)
diffs empty because `git diff` ignores untracked files, so `diff()` falls
back to the same synthesized add-patch whenever the file is absent at the
baseline — a create-or-edit of an untracked file never streams an empty diff.
An empty diff for a **tracked** file (identical to the baseline) stays empty,
as it should. A **git-ignored** file is withheld: the file event still fires
(you're notified it changed) but `diff()` returns `''`, so a secret like a
`.env` never has its contents surfaced in the diff feed.

**Failures are logged, not silent.** Every git/exec/fs failure behind these
accessors (and behind the `find`-poll watcher) still falls back to `''`/an
empty snapshot, but logs first: real anomalies (a failed `git diff`, an
unreadable file, a lost `find` poll) under the `errors` category (on by
default); expected-empty conditions (a new file's `before()`, a non-git
baseline) under the `sandbox` debug category.

**Hook errors are swallowed per hook.** A throwing `sandbox` hook is caught
and logged under the `errors` category (on by default) — it cannot break the
run or stop other hooks (or the `sandbox.file` chunk) from continuing.

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

### b. MEDIUM: Middleware exceptions breaking the stream — in `onChunk` / `onConfig`

Know which hooks the framework already guards. **The terminal hooks
(`onFinish`, `onAbort`, `onError`) are individually wrapped** by core's
`runTerminalHook`: a throw there is logged on the `errors` channel and the next
middleware's terminal hook still runs, so a failed analytics `POST` in `onFinish`
cannot break the stream or replace the abort reason. Guarding those is about
keeping your own bookkeeping intact, not about protecting the run.

**`onChunk` and `onConfig` are NOT guarded, deliberately** — they are transforms
on the data path, where swallowing a throw would forward a chunk or a config the
middleware had decided to reject. A throw from either fails the whole stream. That
is where an unhandled error actually costs you a response:

```typescript
// WRONG -- an unhandled error in onChunk kills the entire streaming response
const fragile: ChatMiddleware = {
  name: 'fragile-chunk-logger',
  onChunk: (ctx, chunk) => {
    // A logger that throws on an unexpected chunk shape takes the stream with it
    logChunk(chunk)
  },
  onConfig: (ctx, config) => {
    // Same for a config transform that reads an env var that is not set
    return { model: requireEnv('MODEL_OVERRIDE') }
  },
}

// CORRECT -- own the failure inside the unguarded hooks
const resilient: ChatMiddleware = {
  name: 'resilient-chunk-logger',
  onChunk: (ctx, chunk) => {
    try {
      logChunk(chunk)
    } catch (err) {
      console.error('Logging failed:', err)
    }
    // Return void to pass through
  },
  onConfig: (ctx, config) => {
    const override = process.env.MODEL_OVERRIDE
    // Decide, do not throw: no override means no transform.
    return override === undefined ? undefined : { model: override }
  },
  onFinish: (ctx, info) => {
    // Already guarded by core — but prefer ctx.defer() anyway, so a slow
    // analytics call does not delay the terminal fan-out at all.
    ctx.defer(
      fetch('/api/analytics', {
        method: 'POST',
        body: JSON.stringify({ duration: info.duration }),
      }),
    )
  },
}
```

Rule: put the try-catch where the framework has none — `onChunk` and `onConfig`
(and the other transform hooks: `onStructuredOutputConfig`, `onBeforeToolCall`,
`onAfterToolCall`). For async side effects in the terminal hooks, prefer
`ctx.defer()`, which runs after the terminal hook and isolates failures.

Source: docs/advanced/middleware.md, `packages/ai/src/activities/chat/middleware/compose.ts`

## Cross-References

- See also: **ai-core/chat-experience/SKILL.md** -- Middleware hooks into the chat lifecycle
- See also: **ai-core/structured-outputs/SKILL.md** -- Middleware now wraps the final structured-output call; use `onStructuredOutputConfig` for JSON-Schema transforms
- See also: **ai-core/ag-ui-protocol/SKILL.md** -- Reading the `sandbox.file` / `sandbox.file.diff` `CUSTOM` chunks the sandbox runtime emits alongside these `sandbox` hooks, via `ChatStream`'s typed `KnownCustomEvent` narrowing
- See also: **`@tanstack/ai-persistence` skills** (`skills/ai-persistence/SKILL.md` in that package) -- Full persistence suite (`withPersistence`, client storage, store contracts, adapter recipes, locks). This file only sketches server `withPersistence`.
