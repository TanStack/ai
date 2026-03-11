# Content Guard Middleware Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a content guard middleware to `@tanstack/ai/middlewares` that filters/transforms streamed text content based on user-defined rules, with delta and buffered matching strategies.

**Architecture:** New `src/middlewares/` directory in `@tanstack/ai` with a barrel export. `toolCacheMiddleware` moves there from `src/activities/chat/middleware/`. Content guard implements the `ChatMiddleware` interface using `onChunk` to intercept `TEXT_MESSAGE_CONTENT` chunks. Buffered strategy holds back a configurable look-behind window to catch cross-chunk patterns.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo with Nx, Vite build

**Spec:** `docs/superpowers/specs/2026-03-11-utility-middlewares-design.md`

---

## Chunk 1: Package restructuring — create `/middlewares` subpath and move toolCacheMiddleware

### Task 1: Create the middlewares barrel and move toolCacheMiddleware

**Files:**
- Create: `packages/typescript/ai/src/middlewares/index.ts`
- Create: `packages/typescript/ai/src/middlewares/tool-cache.ts`
- Modify: `packages/typescript/ai/src/activities/chat/middleware/index.ts`
- Modify: `packages/typescript/ai/src/index.ts`
- Modify: `packages/typescript/ai/package.json`
- Modify: `packages/typescript/ai/vite.config.ts`

- [ ] **Step 1: Create `src/middlewares/tool-cache.ts`**

This re-exports everything from the original location. We don't physically move the file yet — we re-export to keep the internal chat engine's relative imports working.

```ts
// src/middlewares/tool-cache.ts
export {
  toolCacheMiddleware,
  type ToolCacheMiddlewareOptions,
  type ToolCacheStorage,
  type ToolCacheEntry,
} from '../activities/chat/middleware/tool-cache-middleware'
```

- [ ] **Step 2: Create `src/middlewares/index.ts` barrel**

```ts
// src/middlewares/index.ts
export {
  toolCacheMiddleware,
  type ToolCacheMiddlewareOptions,
  type ToolCacheStorage,
  type ToolCacheEntry,
} from './tool-cache'
```

- [ ] **Step 3: Remove middleware exports from main barrel (`src/index.ts`)**

Remove these lines from `src/index.ts`:
```ts
// REMOVE these:
export type {
  ToolCacheMiddlewareOptions,
  ToolCacheStorage,
  ToolCacheEntry,
} from './activities/chat/middleware/index'

export { toolCacheMiddleware } from './activities/chat/middleware/index'

// Re-export devtools middleware from its canonical location
export { devtoolsMiddleware } from '@tanstack/ai-event-client'
```

- [ ] **Step 4: Remove toolCacheMiddleware export from internal middleware barrel**

In `src/activities/chat/middleware/index.ts`, remove:
```ts
// REMOVE:
export { toolCacheMiddleware } from './tool-cache-middleware'
export type {
  ToolCacheMiddlewareOptions,
  ToolCacheStorage,
  ToolCacheEntry,
} from './tool-cache-middleware'
```

Keep the `MiddlewareRunner` and type exports — those are used internally.

- [ ] **Step 5: Add `/middlewares` subpath to `package.json` exports**

Add to `package.json` `exports` field:
```json
"./middlewares": {
  "types": "./dist/esm/middlewares/index.d.ts",
  "import": "./dist/esm/middlewares/index.js"
}
```

- [ ] **Step 6: Add middlewares entry to `vite.config.ts`**

Change the `entry` array from:
```ts
entry: ['./src/index.ts', './src/activities/index.ts'],
```
to:
```ts
entry: ['./src/index.ts', './src/activities/index.ts', './src/middlewares/index.ts'],
```

- [ ] **Step 7: Update test import path**

In `tests/tool-cache-middleware.test.ts`, change the import:
```ts
// FROM:
import { toolCacheMiddleware } from '../src/activities/chat/middleware/tool-cache-middleware'
import type {
  ToolCacheEntry,
  ToolCacheStorage,
} from '../src/activities/chat/middleware/tool-cache-middleware'

// TO:
import { toolCacheMiddleware } from '../src/middlewares/tool-cache'
import type {
  ToolCacheEntry,
  ToolCacheStorage,
} from '../src/middlewares/tool-cache'
```

- [ ] **Step 8: Verify tests pass**

Run: `pnpm --filter @tanstack/ai run test:lib`
Expected: All 565+ tests pass (no regressions from restructuring)

- [ ] **Step 9: Verify types pass**

Run: `pnpm --filter @tanstack/ai run test:types`
Expected: Clean type check

- [ ] **Step 10: Verify build works**

Run: `pnpm --filter @tanstack/ai run clean && pnpm --filter @tanstack/ai run build`
Expected: Build succeeds, `dist/esm/middlewares/index.js` exists in output

- [ ] **Step 11: Commit**

```
git add packages/typescript/ai/src/middlewares/ packages/typescript/ai/src/index.ts packages/typescript/ai/src/activities/chat/middleware/index.ts packages/typescript/ai/package.json packages/typescript/ai/vite.config.ts packages/typescript/ai/tests/tool-cache-middleware.test.ts
git commit -m "refactor: create @tanstack/ai/middlewares subpath, move toolCacheMiddleware"
```

---

## Chunk 2: Content guard middleware — delta strategy + tests

### Task 2: Write failing tests for content guard delta strategy

**Files:**
- Create: `packages/typescript/ai/tests/content-guard-middleware.test.ts`

- [ ] **Step 1: Write the test file with delta strategy tests**

Uses the same test utilities as `tool-cache-middleware.test.ts` — `ev`, `createMockAdapter`, `collectChunks`, `isTextContent`, `getDeltas` from `tests/test-utils.ts`.

```ts
// tests/content-guard-middleware.test.ts
import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { contentGuardMiddleware } from '../src/middlewares/content-guard'
import type { StreamChunk } from '../src/types'
import { ev, createMockAdapter, collectChunks, isTextContent, getDeltas } from './test-utils'

describe('contentGuardMiddleware', () => {
  describe('delta strategy', () => {
    it('should replace regex pattern in delta', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('My SSN is 123-45-6789'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' }],
          strategy: 'delta',
        })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      const text = deltas.join('')
      expect(text).toBe('My SSN is [REDACTED]')
    })

    it('should apply custom function rule', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('hello world'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ fn: (text) => text.toUpperCase() }],
          strategy: 'delta',
        })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('HELLO WORLD')
    })

    it('should compose multiple rules in order', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('foo bar baz'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [
            { pattern: /foo/g, replacement: 'AAA' },
            { fn: (text) => text.toLowerCase() },
          ],
          strategy: 'delta',
        })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      expect(deltas.join('')).toBe('aaa bar baz')
    })

    it('should drop chunk when blockOnMatch is true and content changed', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('safe content'),
          ev.textContent('bad word here'),
          ev.textContent('more safe content'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ pattern: /bad/g, replacement: '***' }],
          strategy: 'delta',
          blockOnMatch: true,
        })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const deltas = getDeltas(chunks)
      // Second chunk should be dropped entirely
      expect(deltas).toEqual(['safe content', 'more safe content'])
    })

    it('should pass through non-text chunks unchanged', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('hello'),
          ev.toolStart('tc-1', 'myTool'),
          ev.toolArgs('tc-1', '{}'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ fn: (text) => text.toUpperCase() }],
          strategy: 'delta',
        })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const toolChunks = chunks.filter(c => c.type === 'TOOL_CALL_START')
      expect(toolChunks).toHaveLength(1)
    })

    it('should call onFiltered callback when content is modified', async () => {
      const onFiltered = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('replace me'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ pattern: /me/g, replacement: 'you' }],
          strategy: 'delta',
          onFiltered,
        })],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(onFiltered).toHaveBeenCalledTimes(1)
      expect(onFiltered).toHaveBeenCalledWith(expect.objectContaining({
        original: 'replace me',
        filtered: 'replace you',
        strategy: 'delta',
      }))
    })

    it('should not call onFiltered when content is unchanged', async () => {
      const onFiltered = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [[
          ev.runStarted(),
          ev.textContent('safe text'),
          ev.runFinished('stop'),
        ]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [contentGuardMiddleware({
          rules: [{ pattern: /badword/g, replacement: '***' }],
          strategy: 'delta',
          onFiltered,
        })],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(onFiltered).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tanstack/ai run test:lib -- --run tests/content-guard-middleware.test.ts`
Expected: FAIL — `contentGuardMiddleware` module not found

### Task 3: Implement content guard delta strategy

**Files:**
- Create: `packages/typescript/ai/src/middlewares/content-guard.ts`
- Modify: `packages/typescript/ai/src/middlewares/index.ts`

- [ ] **Step 3: Create `src/middlewares/content-guard.ts` with types and delta strategy**

```ts
// src/middlewares/content-guard.ts
import type { ChatMiddleware, ChatMiddlewareContext } from '../activities/chat/middleware/types'
import type { StreamChunk, TextMessageContentEvent } from '../types'

/**
 * A content guard rule — either a regex pattern with replacement, or a transform function.
 */
export type ContentGuardRule =
  | { pattern: RegExp; replacement: string }
  | { fn: (text: string) => string }

/**
 * Information passed to the onFiltered callback.
 */
export interface ContentFilteredInfo {
  /** The message ID being filtered */
  messageId: string
  /** The original text before filtering */
  original: string
  /** The filtered text after rules applied */
  filtered: string
  /** Which strategy was used */
  strategy: 'delta' | 'buffered'
}

/**
 * Options for the content guard middleware.
 */
export interface ContentGuardMiddlewareOptions {
  /**
   * Rules to apply to text content. Each rule is either a regex pattern
   * with a replacement string, or a custom transform function.
   * Rules are applied in order. Each rule receives the output of the previous.
   */
  rules: Array<ContentGuardRule>

  /**
   * Matching strategy:
   * - 'delta': Apply rules to each delta as it arrives. Fast, real-time,
   *   but patterns spanning chunk boundaries may be missed.
   * - 'buffered': Accumulate content and apply rules to settled portions,
   *   holding back a look-behind buffer to catch cross-boundary patterns.
   *
   * @default 'buffered'
   */
  strategy?: 'delta' | 'buffered'

  /**
   * Number of characters to hold back before emitting (buffered strategy only).
   * Should be at least as long as the longest pattern you expect to match.
   * Buffer is flushed when the stream ends.
   *
   * @default 50
   */
  bufferSize?: number

  /**
   * If true, drop the entire chunk when any rule changes the content.
   * @default false
   */
  blockOnMatch?: boolean

  /**
   * Callback when content is filtered by any rule.
   */
  onFiltered?: (info: ContentFilteredInfo) => void
}

/**
 * Apply all rules to a string, returning the transformed result.
 */
function applyRules(text: string, rules: Array<ContentGuardRule>): string {
  let result = text
  for (const rule of rules) {
    if ('pattern' in rule) {
      result = result.replace(rule.pattern, rule.replacement)
    } else {
      result = rule.fn(result)
    }
  }
  return result
}

/**
 * Creates a middleware that filters or transforms streamed text content.
 *
 * @example
 * ```ts
 * import { contentGuardMiddleware } from '@tanstack/ai/middlewares'
 *
 * const guard = contentGuardMiddleware({
 *   rules: [
 *     { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]' },
 *   ],
 *   strategy: 'buffered',
 * })
 * ```
 */
export function contentGuardMiddleware(
  options: ContentGuardMiddlewareOptions,
): ChatMiddleware {
  const {
    rules,
    strategy = 'buffered',
    bufferSize = 50,
    blockOnMatch = false,
    onFiltered,
  } = options

  if (strategy === 'delta') {
    return createDeltaStrategy(rules, blockOnMatch, onFiltered)
  }
  return createBufferedStrategy(rules, bufferSize, blockOnMatch, onFiltered)
}

function createDeltaStrategy(
  rules: Array<ContentGuardRule>,
  blockOnMatch: boolean,
  onFiltered?: (info: ContentFilteredInfo) => void,
): ChatMiddleware {
  return {
    name: 'content-guard',

    onChunk(_ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return

      const original = chunk.delta
      const filtered = applyRules(original, rules)

      if (filtered === original) return // unchanged, pass through

      if (onFiltered) {
        onFiltered({
          messageId: chunk.messageId,
          original,
          filtered,
          strategy: 'delta',
        })
      }

      if (blockOnMatch) return null // drop chunk

      return {
        ...chunk,
        delta: filtered,
        // Clear the content field since we can't reliably track accumulated
        // content when modifying deltas
        content: undefined,
      } as StreamChunk
    },
  }
}

// Placeholder — implemented in Task 4
function createBufferedStrategy(
  _rules: Array<ContentGuardRule>,
  _bufferSize: number,
  _blockOnMatch: boolean,
  _onFiltered?: (info: ContentFilteredInfo) => void,
): ChatMiddleware {
  throw new Error('Buffered strategy not yet implemented')
}
```

- [ ] **Step 4: Add contentGuardMiddleware to the middlewares barrel**

In `src/middlewares/index.ts`, add:
```ts
export {
  contentGuardMiddleware,
  type ContentGuardMiddlewareOptions,
  type ContentGuardRule,
  type ContentFilteredInfo,
} from './content-guard'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @tanstack/ai run test:lib -- --run tests/content-guard-middleware.test.ts`
Expected: All 7 delta strategy tests pass

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `pnpm --filter @tanstack/ai run test:lib`
Expected: All tests pass

- [ ] **Step 7: Commit**

```
git add packages/typescript/ai/src/middlewares/content-guard.ts packages/typescript/ai/src/middlewares/index.ts packages/typescript/ai/tests/content-guard-middleware.test.ts
git commit -m "feat: add contentGuardMiddleware with delta strategy"
```

---

## Chunk 3: Content guard middleware — buffered strategy + tests

### Task 4: Write failing tests for buffered strategy

**Files:**
- Modify: `packages/typescript/ai/tests/content-guard-middleware.test.ts`

- [ ] **Step 1: Add buffered strategy tests**

Append a new `describe('buffered strategy', ...)` block to the test file:

```ts
describe('buffered strategy', () => {
  it('should catch patterns spanning chunk boundaries', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('My SSN is 123', 'msg-1'),
        ev.textContent('-45-6789 thanks', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' }],
        strategy: 'buffered',
        bufferSize: 20,
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const deltas = getDeltas(chunks)
    const text = deltas.join('')
    expect(text).toBe('My SSN is [REDACTED] thanks')
    // Verify no raw digits leaked
    expect(text).not.toMatch(/\d{3}-\d{2}-\d{4}/)
  })

  it('should flush remaining buffer on stream end', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('hello world', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /world/g, replacement: 'earth' }],
        strategy: 'buffered',
        bufferSize: 50, // larger than content — everything buffered until flush
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const deltas = getDeltas(chunks)
    expect(deltas.join('')).toBe('hello earth')
  })

  it('should respect custom bufferSize', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        // With bufferSize=5, "hello" (5 chars) should be held back,
        // but "This is a test " (15 chars) minus 5 = 10 chars settled
        ev.textContent('This is a test hello', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /hello/g, replacement: 'WORLD' }],
        strategy: 'buffered',
        bufferSize: 5,
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const deltas = getDeltas(chunks)
    // The full text after filtering should be correct
    expect(deltas.join('')).toBe('This is a test WORLD')
  })

  it('should handle short content smaller than bufferSize', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('hi', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /hi/g, replacement: 'bye' }],
        strategy: 'buffered',
        bufferSize: 50,
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const deltas = getDeltas(chunks)
    expect(deltas.join('')).toBe('bye')
  })

  it('should drop chunks with blockOnMatch in buffered mode', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('this has a badword in it', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /badword/g, replacement: '***' }],
        strategy: 'buffered',
        bufferSize: 50,
        blockOnMatch: true,
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const deltas = getDeltas(chunks)
    // Entire content blocked because pattern matched
    expect(deltas.join('')).toBe('')
  })

  it('should call onFiltered for buffered strategy', async () => {
    const onFiltered = vi.fn()
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('secret 123-45-6789', 'msg-1'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ pattern: /\d{3}-\d{2}-\d{4}/g, replacement: '[REDACTED]' }],
        strategy: 'buffered',
        bufferSize: 50,
        onFiltered,
      })],
    })

    await collectChunks(stream as AsyncIterable<StreamChunk>)
    expect(onFiltered).toHaveBeenCalled()
    const call = onFiltered.mock.calls[0]![0]
    expect(call.strategy).toBe('buffered')
    expect(call.filtered).toContain('[REDACTED]')
  })

  it('should pass through non-text chunks in buffered mode', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[
        ev.runStarted(),
        ev.textContent('hello', 'msg-1'),
        ev.toolStart('tc-1', 'myTool'),
        ev.runFinished('stop'),
      ]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      middleware: [contentGuardMiddleware({
        rules: [{ fn: (t) => t.toUpperCase() }],
        strategy: 'buffered',
        bufferSize: 50,
      })],
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const toolChunks = chunks.filter(c => c.type === 'TOOL_CALL_START')
    expect(toolChunks).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify buffered tests fail**

Run: `pnpm --filter @tanstack/ai run test:lib -- --run tests/content-guard-middleware.test.ts`
Expected: Delta tests pass, buffered tests FAIL with "Buffered strategy not yet implemented"

### Task 5: Implement buffered strategy

**Files:**
- Modify: `packages/typescript/ai/src/middlewares/content-guard.ts`

- [ ] **Step 3: Replace the `createBufferedStrategy` placeholder**

Replace the placeholder function with the full implementation:

```ts
function createBufferedStrategy(
  rules: Array<ContentGuardRule>,
  bufferSize: number,
  blockOnMatch: boolean,
  onFiltered?: (info: ContentFilteredInfo) => void,
): ChatMiddleware {
  let rawAccumulated = ''
  let emittedLength = 0
  let lastMessageId = ''

  return {
    name: 'content-guard',

    onChunk(_ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Flush buffer on stream end events
      if (chunk.type === 'TEXT_MESSAGE_END' || chunk.type === 'RUN_FINISHED') {
        if (rawAccumulated.length === 0) return // nothing buffered

        const filtered = applyRules(rawAccumulated, rules)

        if (blockOnMatch && filtered !== rawAccumulated) {
          // Content was modified — drop everything
          if (onFiltered) {
            onFiltered({
              messageId: lastMessageId,
              original: rawAccumulated,
              filtered,
              strategy: 'buffered',
            })
          }
          rawAccumulated = ''
          emittedLength = 0
          return // pass through the end event unchanged
        }

        const remaining = filtered.slice(emittedLength)
        if (remaining.length > 0) {
          if (onFiltered && filtered !== rawAccumulated) {
            onFiltered({
              messageId: lastMessageId,
              original: rawAccumulated,
              filtered,
              strategy: 'buffered',
            })
          }

          // Emit remaining content as a TEXT_MESSAGE_CONTENT chunk, then the end event
          const flushChunk: StreamChunk = {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: lastMessageId,
            delta: remaining,
            content: filtered,
            timestamp: Date.now(),
          } as StreamChunk

          rawAccumulated = ''
          emittedLength = 0
          return [flushChunk, chunk]
        }

        rawAccumulated = ''
        emittedLength = 0
        return // pass through end event
      }

      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return // pass through

      rawAccumulated += chunk.delta
      lastMessageId = chunk.messageId

      // Compute the safe raw boundary
      const safeRawEnd = rawAccumulated.length - bufferSize
      if (safeRawEnd <= 0) return null // still buffering

      // Apply rules to the settled portion only
      const settledFiltered = applyRules(rawAccumulated.slice(0, safeRawEnd), rules)

      if (blockOnMatch && settledFiltered !== rawAccumulated.slice(0, safeRawEnd)) {
        if (onFiltered) {
          onFiltered({
            messageId: chunk.messageId,
            original: rawAccumulated.slice(0, safeRawEnd),
            filtered: settledFiltered,
            strategy: 'buffered',
          })
        }
        return null // drop — content was modified
      }

      if (settledFiltered.length <= emittedLength) return null // no new content

      const newDelta = settledFiltered.slice(emittedLength)
      emittedLength = settledFiltered.length

      const didChange = settledFiltered !== rawAccumulated.slice(0, safeRawEnd)
      if (didChange && onFiltered) {
        onFiltered({
          messageId: chunk.messageId,
          original: rawAccumulated.slice(0, safeRawEnd),
          filtered: settledFiltered,
          strategy: 'buffered',
        })
      }

      return {
        ...chunk,
        delta: newDelta,
        content: settledFiltered,
      } as StreamChunk
    },
  }
}
```

- [ ] **Step 4: Run all content guard tests**

Run: `pnpm --filter @tanstack/ai run test:lib -- --run tests/content-guard-middleware.test.ts`
Expected: All 14 tests pass (7 delta + 7 buffered)

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter @tanstack/ai run test:lib`
Expected: All tests pass

- [ ] **Step 6: Run type check**

Run: `pnpm --filter @tanstack/ai run test:types`
Expected: Clean

- [ ] **Step 7: Build and verify**

Run: `pnpm --filter @tanstack/ai run clean && pnpm --filter @tanstack/ai run build`
Expected: Build succeeds, `dist/esm/middlewares/content-guard.js` in output

- [ ] **Step 8: Commit**

```
git add packages/typescript/ai/src/middlewares/content-guard.ts packages/typescript/ai/tests/content-guard-middleware.test.ts
git commit -m "feat: add buffered strategy to contentGuardMiddleware"
```
