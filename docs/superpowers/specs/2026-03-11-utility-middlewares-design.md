# Utility Middlewares: Rate Limit & Content Guard

## Overview

Add two new built-in middlewares to `@tanstack/ai` alongside the existing `toolCacheMiddleware`, all exported from a new `@tanstack/ai/middlewares` subpath. This is a clean break — no middleware is exported from the main `@tanstack/ai` barrel.

## Package Structure

### New subpath: `@tanstack/ai/middlewares`

```ts
// All utility middlewares from one subpath
import {
  rateLimitMiddleware,
  contentGuardMiddleware,
  toolCacheMiddleware,
} from '@tanstack/ai/middlewares'
```

**Changes required:**

1. **New entry point:** `src/middlewares/index.ts` — barrel exporting all three middlewares
2. **Move `toolCacheMiddleware`** from `src/activities/chat/middleware/tool-cache-middleware.ts` to `src/middlewares/tool-cache.ts` (re-export from old location removed)
3. **New vite entry:** Add `./src/middlewares/index.ts` to `vite.config.ts` entries
4. **New exports field** in `package.json`:
   ```json
   "./middlewares": {
     "types": "./dist/esm/middlewares/index.d.ts",
     "import": "./dist/esm/middlewares/index.js"
   }
   ```
5. **Remove middleware exports from main barrel** (`src/index.ts`): drop `toolCacheMiddleware` and its types. `devtoolsMiddleware` is not a user-facing utility — it stays in `@tanstack/ai-event-client` only (auto-injected by the chat engine) and is not part of the `/middlewares` subpath.
6. **Internal chat engine** continues importing `toolCacheMiddleware` types via relative path (no change to how it works internally, just the public export surface)

### File layout

```
src/middlewares/
  index.ts                  # barrel: re-exports all three
  rate-limit.ts             # rateLimitMiddleware
  content-guard.ts          # contentGuardMiddleware
  tool-cache.ts             # toolCacheMiddleware (moved from middleware/)
```

---

## Rate Limit Middleware

### Purpose

Guards against runaway agent loops, excessive tool calls, and unbounded token spend. Provides configurable limits with user-controlled enforcement behavior.

### API

```ts
import { rateLimitMiddleware } from '@tanstack/ai/middlewares'

const middleware = rateLimitMiddleware({
  // Tool call limits
  maxToolCallsPerIteration: 10,
  maxToolCallsTotal: 50,

  // Token budget
  maxTokens: 100_000,

  // What to do when a limit is hit
  behavior: 'finish-iteration', // or 'abort-immediately'

  // Optional callback when a limit is reached
  onLimitReached: (info) => {
    console.warn(`Rate limit hit: ${info.type}`, info)
  },
})
```

### Options type

```ts
interface RateLimitMiddlewareOptions {
  /**
   * Max tool calls allowed within a single agent iteration.
   * When exceeded, remaining tool calls in that iteration are skipped.
   * @default Infinity
   */
  maxToolCallsPerIteration?: number

  /**
   * Max tool calls allowed across the entire chat request.
   * @default Infinity
   */
  maxToolCallsTotal?: number

  /**
   * Max cumulative tokens (prompt + completion) across all iterations.
   * Tracked via onUsage hook.
   * @default Infinity
   */
  maxTokens?: number

  /**
   * Behavior when a limit is reached:
   * - 'abort-immediately': calls ctx.abort() right away
   * - 'finish-iteration': lets current iteration complete, prevents next
   *
   * For maxToolCallsPerIteration, 'finish-iteration' means remaining tool
   * calls in the iteration are skipped with an error result, but streaming
   * content from that iteration is preserved.
   *
   * @default 'abort-immediately'
   */
  behavior?: 'abort-immediately' | 'finish-iteration'

  /**
   * Callback when any limit is reached. Called once per limit type per request.
   */
  onLimitReached?: (info: RateLimitInfo) => void
}

interface RateLimitInfo {
  /** Which limit was hit */
  type: 'tool-calls-per-iteration' | 'tool-calls-total' | 'tokens'
  /** Current count at time of limit */
  current: number
  /** The configured limit */
  limit: number
}
```

### Hooks used

| Hook | Purpose |
|------|---------|
| `onBeforeToolCall` | Count tool calls, skip/abort when limits exceeded |
| `onIteration` | Reset per-iteration counter, check if should abort due to previous token overshoot |
| `onUsage` | Accumulate token counts, check budget |

### Internal state

- `toolCallsThisIteration: number` — reset on each `onIteration`
- `toolCallsTotal: number` — monotonically increasing
- `totalTokens: number` — accumulated from `onUsage`
- `limitReached: Set<string>` — tracks which limits have fired (each fires callback once)

### Behavior details

**`maxToolCallsPerIteration`:**
- `onBeforeToolCall` increments counter
- When exceeded with `'abort-immediately'`: `ctx.abort('Rate limit: max tool calls per iteration')`
- When exceeded with `'finish-iteration'`: returns `{ type: 'skip', result: { error: 'Rate limit exceeded' } }`

**`maxToolCallsTotal`:**
- `onBeforeToolCall` increments counter
- When exceeded with `'abort-immediately'`: `ctx.abort('Rate limit: max total tool calls')`
- When exceeded with `'finish-iteration'`: returns `{ type: 'skip', result: { error: 'Rate limit exceeded' } }` for remaining calls, model won't see tool results and loop will terminate naturally

**`maxTokens`:**
- `onUsage` accumulates `totalTokens`
- When exceeded with `'abort-immediately'`: `ctx.abort('Rate limit: token budget exceeded')`
- When exceeded with `'finish-iteration'`: sets a flag, `onIteration` checks flag at start of next iteration and aborts

### Abort behavior notes

`ctx.abort()` sets an internal flag that the chat engine checks between chunks and iterations. It does **not** cancel an in-flight HTTP request to the LLM provider — the adapter's request signal is controlled by the user-provided `abortController`, not the middleware abort controller.

This means:
- With `'abort-immediately'`: the abort takes effect after the current in-flight operation yields its next chunk. The model call is not cancelled mid-request.
- With `'finish-iteration'` + `maxTokens`: the abort fires in `onIteration` at the start of the next iteration. However, the engine calls `beginCycle()` (which invokes `onIteration`) and then immediately proceeds to `streamModelResponse()`. The `isCancelled()` check happens before `beginCycle()`, not after. This means one additional model API call may be initiated before the abort is detected.

For hard cancellation of in-flight requests, users should combine this middleware with their own `abortController` via the `onLimitReached` callback:

```ts
const controller = new AbortController()

chat({
  abortController: controller,
  middleware: [
    rateLimitMiddleware({
      maxTokens: 100_000,
      onLimitReached: () => controller.abort(),
    }),
  ],
})
```

---

## Content Guard Middleware

### Purpose

Filters or transforms streamed text content based on user-defined rules. Supports regex patterns, replacement functions, and configurable matching strategies for different latency/accuracy trade-offs.

### API

```ts
import { contentGuardMiddleware } from '@tanstack/ai/middlewares'

const middleware = contentGuardMiddleware({
  rules: [
    // Regex pattern with replacement
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]' },

    // Custom function
    { fn: (text) => text.replace(/badword/gi, '***') },
  ],

  // How to match: 'delta' | 'buffered'
  strategy: 'buffered',

  // Optional: drop chunk entirely instead of redacting
  blockOnMatch: false,

  // Optional callback when content is filtered
  onFiltered: (info) => {
    console.log(`Filtered content in message ${info.messageId}`)
  },
})
```

### Options type

```ts
interface ContentGuardMiddlewareOptions {
  /**
   * Rules to apply to text content. Each rule is either:
   * - A regex pattern with a replacement string
   * - A custom transform function
   *
   * Rules are applied in order. Each rule receives the output of the previous.
   */
  rules: Array<ContentGuardRule>

  /**
   * Matching strategy:
   * - 'delta': Apply rules to each delta as it arrives. Fast, real-time,
   *   but patterns spanning chunk boundaries may be missed.
   * - 'buffered': Accumulate content and apply rules to the full text, but
   *   hold back a configurable look-behind buffer to catch patterns that
   *   span chunk boundaries. Only emits content that is "settled" (past
   *   the buffer window). Adds latency equal to the buffer size but
   *   provides reliable cross-boundary matching.
   *
   * @default 'buffered'
   */
  strategy?: 'delta' | 'buffered'

  /**
   * Number of characters to hold back in the buffer before emitting.
   * Only applies to the 'buffered' strategy. Should be at least as long
   * as the longest pattern you expect to match (e.g., SSN = 11 chars).
   *
   * The buffer is flushed when the stream ends (RUN_FINISHED/TEXT_MESSAGE_END).
   *
   * @default 50
   */
  bufferSize?: number

  /**
   * If true, drop the entire chunk when any rule matches instead of
   * replacing the content. Useful for hard blocks rather than redaction.
   *
   * Match detection: rules are applied in order, and `blockOnMatch` checks
   * whether the final output (after all rules) differs from the input.
   * If any rule changed the text, the chunk is dropped.
   *
   * @default false
   */
  blockOnMatch?: boolean

  /**
   * Callback when content is filtered by any rule.
   */
  onFiltered?: (info: ContentFilteredInfo) => void
}

type ContentGuardRule =
  | { pattern: RegExp; replacement: string }
  | { fn: (text: string) => string }

interface ContentFilteredInfo {
  /** The message ID being filtered */
  messageId: string
  /** The original text before filtering */
  original: string
  /** The filtered text after rules applied */
  filtered: string
  /** Which strategy was used */
  strategy: 'delta' | 'buffered'
}
```

### Hooks used

| Hook | Purpose |
|------|---------|
| `onChunk` | Transform `TEXT_MESSAGE_CONTENT` chunks based on rules and strategy |

### Strategy implementations

**`delta` strategy:**
1. Receive `TEXT_MESSAGE_CONTENT` chunk
2. Apply rules to `chunk.delta`
3. If changed and `blockOnMatch`: return `null` (drop)
4. If changed: return chunk with modified `delta`
5. Track accumulated content (sum of emitted deltas) for `content` field
6. Pass through non-text chunks unchanged

**`buffered` strategy:**

Uses a look-behind buffer to catch patterns that span chunk boundaries (e.g. an SSN split across two chunks like `"123"` + `"-45-6789"`).

1. Maintain `rawAccumulated` (all raw deltas), `emittedLength` (chars of filtered output already emitted), and `bufferSize`
2. On `TEXT_MESSAGE_CONTENT` chunk: append `delta` to `rawAccumulated`
3. Compute the safe raw boundary: `safeRawEnd = rawAccumulated.length - bufferSize`
   - If `safeRawEnd <= 0`: return `null` (still buffering, not enough raw input yet)
4. Apply rules to `rawAccumulated.slice(0, safeRawEnd)` to produce `settledFiltered`
5. If `settledFiltered.length > emittedLength`: the new delta is `settledFiltered.slice(emittedLength)`
   - Emit chunk with new delta and `content` set to `settledFiltered`
   - Update `emittedLength = settledFiltered.length`
6. If `settledFiltered.length <= emittedLength`: return `null` (no new content to emit)
7. On stream end (`TEXT_MESSAGE_END` or `RUN_FINISHED`): flush remaining buffer
   - Apply rules to the full final `rawAccumulated`
   - Emit any remaining content from `emittedLength` to end of filtered result
   - If there's remaining content, emit a final `TEXT_MESSAGE_CONTENT` chunk before passing through the end event
8. If `blockOnMatch`: check if filtered result differs from raw accumulated. If so, drop all buffered content and return `null` for the current chunk.

**Why this works:** The safe boundary is computed in raw-input space (`rawAccumulated.length - bufferSize`), ensuring that any pattern up to `bufferSize` characters that straddles a chunk boundary will be fully visible before those characters are emitted. Rules are applied only to the settled portion of the raw input, so replacements that change text length don't affect the buffer window's correctness. Once characters pass the settled boundary, they're safe — no future delta can cause a retroactive change to already-emitted content.

### Edge cases

- **Non-text chunks:** Pass through unchanged (only `TEXT_MESSAGE_CONTENT` is filtered)
- **Empty delta after filtering:** Return `null` to drop the chunk
- **Regex flags:** Rules with regex should use the `g` flag for `replaceAll` behavior. The middleware calls `String.prototype.replace()` directly, so the user controls matching behavior via flags.
- **Rule ordering:** Rules compose left-to-right. Output of rule N is input to rule N+1.
- **Buffer flush on stream end:** The `onChunk` hook also handles `TEXT_MESSAGE_END` and `RUN_FINISHED` to flush buffered content. The middleware emits any remaining filtered content as a `TEXT_MESSAGE_CONTENT` chunk, then passes through the end event.
- **Short messages:** If the total content is shorter than `bufferSize`, everything is buffered until stream end and emitted as one chunk.
- **`blockOnMatch` semantics:** Match detection checks whether the final output (after all rules applied in order) differs from the original input. If any rule changed the text, the chunk is considered "matched."

### Internal state

- `rawAccumulated: string` — sum of all raw deltas
- `emittedLength: number` — characters already emitted to the consumer (buffered strategy)
- `filteredAccumulated: string` — sum of emitted deltas (delta strategy, for `content` field)

---

## Migration: toolCacheMiddleware

`toolCacheMiddleware` moves from the main barrel to the middlewares subpath. No API changes. This is a **breaking change** to the import path — acceptable pre-1.0.

**Before:**
```ts
import { toolCacheMiddleware } from '@tanstack/ai'
```

**After:**
```ts
import { toolCacheMiddleware } from '@tanstack/ai/middlewares'
```

The implementation file moves from `src/activities/chat/middleware/tool-cache-middleware.ts` to `src/middlewares/tool-cache.ts`. Types (`ToolCacheMiddlewareOptions`, `ToolCacheStorage`, `ToolCacheEntry`) move with it.

The internal chat engine's middleware barrel (`src/activities/chat/middleware/index.ts`) no longer exports `toolCacheMiddleware`. Only the `MiddlewareRunner` and types remain there.

---

## Main barrel changes (`src/index.ts`)

**Removed exports:**
- `toolCacheMiddleware`
- `ToolCacheMiddlewareOptions`, `ToolCacheStorage`, `ToolCacheEntry` types
- `devtoolsMiddleware` re-export (remains in `@tanstack/ai-event-client` only)

**Kept:** All other exports unchanged. Middleware types (`ChatMiddleware`, `ChatMiddlewareContext`, etc.) stay in the main barrel since they're needed by anyone writing custom middleware.

---

## Testing

Each middleware gets its own test file in `tests/`:

- `tests/rate-limit-middleware.test.ts`
- `tests/content-guard-middleware.test.ts`
- `tests/tool-cache-middleware.test.ts` (existing, path updated)

### Rate limit test cases:
- Tool call count per iteration enforced
- Tool call total across iterations enforced
- Token budget enforced via mock usage events
- `'abort-immediately'` vs `'finish-iteration'` behavior difference
- `onLimitReached` callback fires once per limit type
- No interference when limits not exceeded

### Content guard test cases:
- Regex pattern replacement in delta mode
- Custom function rule
- Multiple rules compose in order
- `blockOnMatch` drops chunk when final output differs from input
- `'buffered'` strategy catches patterns spanning chunk boundaries (e.g. SSN split across chunks)
- `'buffered'` strategy flushes remaining content on stream end
- `'buffered'` strategy holds back correct number of characters
- Short content (< bufferSize) emitted correctly on flush
- Non-text chunks pass through unchanged
- `onFiltered` callback fires with correct info
- Empty delta after filtering drops chunk
- Custom `bufferSize` respected
