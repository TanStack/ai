import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import {
  RUN_CANCEL_REASON,
  requestRunCancel,
  wasCancelRequested,
} from '../src/activities/chat/cancel'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import {
  InMemoryRunStore,
  provideDetachableRun,
  provideRunDetached,
} from '../src/activities/chat/middleware/run-store'
import { publishRunDetachedSignal } from '../src/delivery-detach'
import { memoryStream } from '../src/stream-durability'
import { toServerSentEventsResponse } from '../src/stream-to-response'
import { EventType } from '../src/types'
import { createMockAdapter, ev } from './test-utils'
import type { RunStore } from '../src/activities/chat/middleware/run-store'
import type { StreamChunk } from '../src/types'

/**
 * A DETACHED run's delivery log must stay OPEN.
 *
 * The durable delivery sink used to append a synthetic terminal `RUN_ERROR`
 * ("Request aborted") and call `durability.close()` for EVERY abort. On a plain
 * disconnect of a detachable run that defeats takeover twice over: the log is
 * terminalized, so a later attach's replay stops at the prefix, and the stored
 * `RUN_ERROR` is a chunk the takeover's journal replay cannot reproduce, so
 * alignment diverges and a healthy detached run is recorded as `'failed'`.
 *
 * These tests drive the WHOLE seam rather than stubbing it: a real `chat()`, a
 * real `toServerSentEventsResponse` with a real `memoryStream`, and a middleware
 * that publishes `provideRunDetached` under exactly the rule `withSandbox`'s
 * `onAbort` uses. So they also pin the ordering the fix depends on — the sink's
 * verdict is read only after the chat generator's `return()` has awaited the
 * whole `onAbort` chain.
 */

/** Unique per test, so no run can observe another's log. */
function runId(label: string): string {
  return `${label}-${crypto.randomUUID()}`
}

/** A `memoryStream` that also counts `close()` calls. */
function spyLog(id: string) {
  const inner = memoryStream(
    new Request(`https://example.test/api/chat?runId=${id}`, {
      method: 'POST',
    }),
  )
  let closes = 0
  return {
    closes: () => closes,
    async stored(): Promise<Array<StreamChunk>> {
      return (await inner.snapshot()).map((entry) => entry.chunk)
    },
    adapter: {
      ...inner,
      close: async () => {
        closes += 1
        await inner.close()
      },
    },
  }
}

/**
 * `withSandbox`'s abort rule, reduced to the two facts core cares about.
 *
 * `detachable` is published at setup (a `RunStore` plus a durable log are
 * wired); the DETACHED verdict is published on the abort path only, and only
 * for a disconnect with no cancel intent in either band — in-process
 * (`info.cancelRequested`) or durable (`wasCancelRequested` on the record).
 */
function fakeSandbox(options: {
  detachable: boolean
  detachOnDisconnect?: boolean
  runs?: RunStore
}) {
  return defineChatMiddleware({
    name: 'test-fake-sandbox',
    setup(ctx) {
      if (options.detachable) provideDetachableRun(ctx, true)
    },
    async onAbort(ctx, info) {
      const cancelled =
        info.cancelRequested === true ||
        (options.runs !== undefined &&
          (await wasCancelRequested(options.runs, ctx.runId)))
      if (
        options.detachable &&
        !cancelled &&
        options.detachOnDisconnect !== false
      ) {
        provideRunDetached(ctx, true)
      }
    },
  })
}

/**
 * A middleware that publishes the DETACHED verdict for every abort, ignoring
 * cancel intent. Models a middleware that watches only one band — or is simply
 * buggy — so core's own refusal to spare an explicit in-process cancel can be
 * tested in isolation.
 */
function alwaysDetaches() {
  return defineChatMiddleware({
    name: 'test-always-detaches',
    setup(ctx) {
      provideDetachableRun(ctx, true)
    },
    onAbort(ctx) {
      provideRunDetached(ctx, true)
    },
  })
}

/**
 * An adapter that streams a prefix, then trips `abortController` mid-stream —
 * the server-side shape of a client going away — and keeps yielding, so the
 * sink's own abort check is what stops delivery.
 *
 * `reason` is the entire difference between a disconnect and an in-process
 * cancel: `undefined` is the reason-less abort a closed socket produces.
 */
function disconnectingAdapter(
  abortController: AbortController,
  reason?: string,
) {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield ev.textContent('1')
        yield ev.textContent('2')
        abortController.abort(reason)
        yield ev.textContent('3')
      })(),
  })
}

/** An adapter whose provider throws part-way through: a GENUINE failure. */
function throwingAdapter() {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield ev.textContent('1')
        throw new Error('provider exploded')
      })(),
  })
}

/** An adapter that completes normally. */
function finishingAdapter() {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield ev.textContent('1')
        yield ev.textEnd()
        yield ev.runFinished('stop')
      })(),
  })
}

async function drain(response: Response): Promise<void> {
  if (!response.body) throw new Error('Expected a response body')
  const reader = response.body.getReader()
  for (;;) {
    const result = await reader.read()
    if (result.done) return
  }
}

/** Run one durable delivery to completion and report what the log holds. */
async function deliver(input: {
  id: string
  adapter: ReturnType<typeof createMockAdapter>['adapter']
  abortController: AbortController
  middleware: ReturnType<typeof fakeSandbox>
}): Promise<{ types: Array<string>; closes: number }> {
  const log = spyLog(input.id)
  const stream = chat({
    adapter: input.adapter,
    messages: [{ role: 'user', content: 'go' }],
    runId: input.id,
    threadId: `thread-${input.id}`,
    abortController: input.abortController,
    middleware: [input.middleware],
  })

  // `batch: 1` so each chunk is persisted as produced: a disconnect mid-stream
  // must leave a real prefix behind, not an unflushed buffer.
  await drain(
    toServerSentEventsResponse(stream as AsyncIterable<StreamChunk>, {
      durability: { adapter: log.adapter, batch: 1 },
      abortController: input.abortController,
    }),
  )

  return {
    types: (await log.stored()).map((chunk) => chunk.type),
    closes: log.closes(),
  }
}

describe('durable delivery on a DETACHED disconnect', () => {
  it('appends no terminal RUN_ERROR and does not close the log', async () => {
    const id = runId('detached-disconnect')
    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController).adapter,
      abortController,
      middleware: fakeSandbox({ detachable: true }),
    })

    // Exactly the delivered prefix (led by the run-accepted marker every
    // fresh durable producer appends), with nothing terminal appended after.
    expect(types).toEqual([
      EventType.CUSTOM,
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
    ])
    expect(types).not.toContain(EventType.RUN_ERROR)
    // And the log is still OPEN, so the takeover can continue it.
    expect(closes).toBe(0)
  })

  it('honours the detach verdict after lower-level terminal chunks', async () => {
    const id = runId('detached-after-tool-call')
    const abortController = new AbortController()
    const log = spyLog(id)
    const threadId = `thread-${id}`
    const stream = (async function* () {
      yield ev.runStarted(id, threadId)
      yield ev.runFinished('stop', id, undefined, threadId)
      yield ev.runFinished('stop', id, undefined, threadId)
      abortController.abort()
      yield ev.textContent('after-terminal')
    })()
    publishRunDetachedSignal(stream, () => true)

    await drain(
      toServerSentEventsResponse(stream, {
        durability: { adapter: log.adapter, batch: 1 },
        abortController,
      }),
    )

    const types = (await log.stored()).map((chunk) => chunk.type)
    expect(
      types.filter((type) => type === EventType.RUN_FINISHED),
    ).toHaveLength(2)
    expect(types).not.toContain(EventType.RUN_ERROR)
    expect(log.closes()).toBe(0)
  })

  it('still terminalizes and closes for an EXPLICIT cancel in the in-process band', async () => {
    const id = runId('detached-cancel-inprocess')
    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController, RUN_CANCEL_REASON).adapter,
      abortController,
      middleware: fakeSandbox({ detachable: true }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it("refuses an in-process cancel even when the run's middleware published a detach verdict", async () => {
    // Core's own guard, tested on its own: a middleware that only watches the
    // durable band (or is simply wrong) publishes DETACHED for this abort, and
    // the sink must still terminalize because the caller aborted with
    // RUN_CANCEL_REASON. Without this the user's Stop leaves an open log.
    const id = runId('core-cancel-guard')
    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController, RUN_CANCEL_REASON).adapter,
      abortController,
      middleware: alwaysDetaches(),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it('still terminalizes and closes for an EXPLICIT cancel in the durable band', async () => {
    // The band that reaches a run driven elsewhere: the connection close is
    // byte-identical to a plain disconnect (no reason), and the only difference
    // is the intent recorded on the record beforehand.
    const id = runId('detached-cancel-durable')
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: id,
      threadId: `thread-${id}`,
      startedAt: 1,
    })
    await requestRunCancel(runs, id)

    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController).adapter,
      abortController,
      middleware: fakeSandbox({ detachable: true, runs }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it('still terminalizes and closes for a NON-detachable disconnect', async () => {
    const id = runId('non-detachable-disconnect')
    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController).adapter,
      abortController,
      middleware: fakeSandbox({ detachable: false }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it('still terminalizes and closes when a detachable run opted out of detach-on-disconnect', async () => {
    const id = runId('detach-opted-out')
    const abortController = new AbortController()
    const { types, closes } = await deliver({
      id,
      adapter: disconnectingAdapter(abortController).adapter,
      abortController,
      middleware: fakeSandbox({
        detachable: true,
        detachOnDisconnect: false,
      }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it('still terminalizes and closes on a GENUINE provider failure', async () => {
    const id = runId('detachable-error')
    const { types, closes } = await deliver({
      id,
      adapter: throwingAdapter().adapter,
      abortController: new AbortController(),
      middleware: fakeSandbox({ detachable: true }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })

  it('publishes the verdict on the STRUCTURED-OUTPUT path too', async () => {
    // `publishRunDetachedSignal` was wired only in `runStreamingText`, so a
    // durable `chat({ outputSchema, stream: true })` could never detach: the sink
    // saw no verdict and terminalized a healthy detached run's log.
    const id = runId('detached-structured')
    const abortController = new AbortController()
    const log = spyLog(id)
    const stream = chat({
      adapter: createMockAdapter({
        supportsCombinedToolsAndSchema: true,
        chatStreamFn: () =>
          (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('{"a":')
            abortController.abort()
            yield ev.textContent('1}')
          })(),
      }).adapter,
      messages: [{ role: 'user', content: 'go' }],
      runId: id,
      threadId: `thread-${id}`,
      abortController,
      middleware: [fakeSandbox({ detachable: true })],
      outputSchema: z.object({ a: z.number() }),
      stream: true,
    })

    await drain(
      toServerSentEventsResponse(stream as AsyncIterable<StreamChunk>, {
        durability: { adapter: log.adapter, batch: 1 },
        abortController,
      }),
    )

    const types = (await log.stored()).map((chunk) => chunk.type)
    expect(types).not.toContain(EventType.RUN_ERROR)
    expect(log.closes()).toBe(0)
  })

  it('closes the log unchanged on a normal finish', async () => {
    const id = runId('detachable-finish')
    const { types, closes } = await deliver({
      id,
      adapter: finishingAdapter().adapter,
      abortController: new AbortController(),
      middleware: fakeSandbox({ detachable: true }),
    })

    expect(types.at(-1)).toBe(EventType.RUN_FINISHED)
    expect(types).not.toContain(EventType.RUN_ERROR)
    expect(closes).toBe(1)
  })
})
