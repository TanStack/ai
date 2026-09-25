import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import {
  RUN_CANCEL_REASON,
  isCancelRequestedReason,
} from '../src/activities/chat/cancel'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { AbortInfo } from '../src/activities/chat/middleware/types'
import type { StreamChunk } from '../src/types'

/** Captures the `AbortInfo` core hands to `onAbort`. */
function abortRecorder() {
  const seen: Array<AbortInfo> = []
  return {
    seen,
    middleware: defineChatMiddleware({
      name: 'test-abort-recorder',
      onAbort(_ctx, info) {
        seen.push(info)
      },
    }),
  }
}

/** A stream long enough that the caller can abort part-way through it. */
function longAdapter() {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield ev.textContent('Hello')
        yield ev.textContent(' world')
        yield ev.textContent(' more')
        yield ev.textEnd()
        yield ev.runFinished('stop')
      })(),
  })
}

/**
 * Drives a real `chat()` against a caller-supplied `AbortController` and aborts
 * it mid-stream with `reason`, so the abort travels the SAME path a cancel
 * endpoint uses (`controller.abort(...)`), not the middleware `ctx.abort()`
 * shortcut.
 */
async function runAbortedByCaller(
  abort: (controller: AbortController) => void,
): Promise<Array<AbortInfo>> {
  const { adapter } = longAdapter()
  const recorder = abortRecorder()
  const abortController = new AbortController()

  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    abortController,
    middleware: [recorder.middleware],
  })

  let count = 0
  for await (const _chunk of stream as AsyncIterable<StreamChunk>) {
    count++
    if (count === 3) abort(abortController)
  }

  return recorder.seen
}

describe('AbortInfo.cancelRequested', () => {
  describe('caller-supplied AbortSignal (in-process cancel channel)', () => {
    it('is true when the caller aborts with RUN_CANCEL_REASON', async () => {
      const seen = await runAbortedByCaller((c) => c.abort(RUN_CANCEL_REASON))

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe(RUN_CANCEL_REASON)
      expect(seen[0]?.cancelRequested).toBe(true)
    })

    it('is false when the caller aborts with an unrelated reason', async () => {
      const seen = await runAbortedByCaller((c) => c.abort('socket hang up'))

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe('socket hang up')
      expect(seen[0]?.cancelRequested).toBe(false)
    })

    it('is false when the caller aborts with a reason that merely contains the sentinel', async () => {
      const seen = await runAbortedByCaller((c) =>
        c.abort(`upstream said ${RUN_CANCEL_REASON} maybe`),
      )

      expect(seen).toHaveLength(1)
      expect(seen[0]?.cancelRequested).toBe(false)
    })

    it('is false, with no reason, when the caller aborts with no reason (plain disconnect)', async () => {
      const seen = await runAbortedByCaller((c) => c.abort())

      expect(seen).toHaveLength(1)
      // A reason-less abort carries a DOMException, never a string.
      expect(seen[0]?.reason).toBeUndefined()
      expect(seen[0]?.cancelRequested).toBe(false)
    })

    it('is false when the caller aborts with a non-string reason', async () => {
      const seen = await runAbortedByCaller((c) =>
        c.abort(new Error(RUN_CANCEL_REASON)),
      )

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBeUndefined()
      expect(seen[0]?.cancelRequested).toBe(false)
    })
  })

  // `ctx.abort()` trips the middleware AbortController, so the run still ends
  // through the `finally` cancellation branch — the same call site the caller
  // signal uses, reached with `this.abortReason` already set.
  describe('middleware-initiated abort (ctx.abort)', () => {
    async function runAbortedByMiddleware(
      reason: string | undefined,
    ): Promise<Array<AbortInfo>> {
      const { adapter } = longAdapter()
      const recorder = abortRecorder()
      const aborter = defineChatMiddleware({
        name: 'test-middleware-aborter',
        onChunk(ctx, value) {
          if (value.type === 'TEXT_MESSAGE_CONTENT') ctx.abort(reason)
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [aborter, recorder.middleware],
      })

      for await (const _chunk of stream as AsyncIterable<StreamChunk>) {
        // drain
      }

      return recorder.seen
    }

    it('is true for ctx.abort(RUN_CANCEL_REASON)', async () => {
      const seen = await runAbortedByMiddleware(RUN_CANCEL_REASON)

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe(RUN_CANCEL_REASON)
      expect(seen[0]?.cancelRequested).toBe(true)
    })

    it('is false for ctx.abort with an unrelated reason', async () => {
      const seen = await runAbortedByMiddleware('budget exceeded')

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe('budget exceeded')
      expect(seen[0]?.cancelRequested).toBe(false)
    })
  })

  // An `onBeforeToolCall` abort decision throws `MiddlewareAbortError`, which is
  // handled by the OTHER `runOnAbort` call site — the catch branch, which reads
  // the reason straight off the error message.
  describe('MiddlewareAbortError (onBeforeToolCall abort decision)', () => {
    async function runAbortedByToolDecision(
      reason: string,
    ): Promise<Array<AbortInfo>> {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
        ],
      })
      const recorder = abortRecorder()
      const denier = defineChatMiddleware({
        name: 'test-tool-denier',
        onBeforeToolCall: () => ({ type: 'abort' as const, reason }),
      })

      await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Hi' }],
          tools: [serverTool('myTool', () => ({ ok: true }))],
          middleware: [denier, recorder.middleware],
        }) as AsyncIterable<StreamChunk>,
      )

      return recorder.seen
    }

    it('is true when the abort decision carries RUN_CANCEL_REASON', async () => {
      const seen = await runAbortedByToolDecision(RUN_CANCEL_REASON)

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe(RUN_CANCEL_REASON)
      expect(seen[0]?.cancelRequested).toBe(true)
    })

    it('is false for an ordinary policy abort', async () => {
      const seen = await runAbortedByToolDecision('policy violation')

      expect(seen).toHaveLength(1)
      expect(seen[0]?.reason).toBe('policy violation')
      expect(seen[0]?.cancelRequested).toBe(false)
    })
  })

  describe('isCancelRequestedReason', () => {
    it('matches the sentinel exactly and never as a substring', () => {
      expect(isCancelRequestedReason(RUN_CANCEL_REASON)).toBe(true)
      expect(isCancelRequestedReason(undefined)).toBe(false)
      expect(isCancelRequestedReason('')).toBe(false)
      expect(isCancelRequestedReason(`${RUN_CANCEL_REASON} `)).toBe(false)
      expect(isCancelRequestedReason(`x${RUN_CANCEL_REASON}`)).toBe(false)
      expect(isCancelRequestedReason('cancel-requested')).toBe(false)
    })
  })
})
