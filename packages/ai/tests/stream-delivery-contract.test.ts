import { describe, expect, it, vi } from 'vitest'
import { toServerSentEventsResponse } from '../src/stream-to-response'
import { ev } from './test-utils'
import type { StreamDurability } from '../src/stream-durability'
import type { StreamChunk } from '../src/types'

function deferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve = (): void => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function readBody(response: Response): Promise<string> {
  if (!response.body) throw new Error('Expected a response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  for (;;) {
    const result = await reader.read()
    if (result.done) return body
    body += decoder.decode(result.value)
  }
}

function parseEvents(body: string): Array<{ id?: string; chunk: StreamChunk }> {
  return body
    .split('\n\n')
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const id = lines.find((line) => line.startsWith('id: '))?.slice(4)
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
      if (!data) throw new Error(`Missing SSE data line in ${block}`)
      return { ...(id === undefined ? {} : { id }), chunk: JSON.parse(data) }
    })
}

function oneChunkStream(): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      yield ev.textContent('hello')
    },
  }
}

describe('delivery durability contract', () => {
  it('forwards an adapter-owned replay offset unchanged and never closes the producer', async () => {
    const resumeOffset = 'backend:v3:resume/token?partition=west'
    const replayOffset = 'backend:v3:event/token#17'
    const close = vi.fn(async () => undefined)
    const durability = {
      resumeFrom: () => resumeOffset,
      append: async () => [],
      read: async function* (offset: string) {
        expect(offset).toBe(resumeOffset)
        yield {
          offset: replayOffset,
          chunk: ev.textContent('replayed'),
        }
      },
      close,
      // This fake never stores an appended chunk, so it has nothing to
      // report at a point in time.
      snapshot: () => Promise.resolve([]),
    } satisfies StreamDurability

    const response = toServerSentEventsResponse(oneChunkStream(), {
      durability: { adapter: durability },
    })
    const events = parseEvents(await readBody(response))

    expect(events.map((event) => event.id)).toEqual([replayOffset])
    expect(close).not.toHaveBeenCalled()
  })

  it('awaits producer close before completing a normal response', async () => {
    const closing = deferred()
    const close = vi.fn(() => closing.promise)
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) =>
        chunks.map((_, index) => `backend:normal:${index}`),
      read: async function* () {},
      close,
      // This fake synthesizes offsets from the batch index and never stores
      // the appended chunks, so there is nothing to snapshot.
      snapshot: () => Promise.resolve([]),
    } satisfies StreamDurability
    const bodyPromise = readBody(
      toServerSentEventsResponse(oneChunkStream(), {
        durability: { adapter: durability, batch: 1 },
      }),
    )
    let bodySettled = false
    void bodyPromise.then(() => {
      bodySettled = true
    })

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(bodySettled).toBe(false)

    closing.resolve()
    await expect(bodyPromise).resolves.toContain('backend:normal:0')
  })

  // Persistence-on semantics: a durable run is decoupled from its HTTP
  // response, so a reader cancel (a page reload / dropped socket) must NOT kill
  // the run. The producer keeps draining into the durable log to its own real
  // terminal, so a rejoining client can tail it to completion — never a
  // synthetic RUN_ERROR. A genuine caller abort (stop(), or a request signal)
  // still terminalizes; that case is covered by the next test.
  it('keeps producing to the durable log when the reader cancels (persistence survives disconnect)', async () => {
    const abortController = new AbortController()
    const closing = deferred()
    const sourceClosed = deferred()
    const proceed = deferred()
    const appended: Array<StreamChunk> = []
    const close = vi.fn(() => closing.promise)
    let seq = 0
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) => {
        appended.push(...chunks)
        return chunks.map(() => `backend:cancel:${seq++}`)
      },
      read: async function* () {},
      close,
      // `appended` here only records chunks for this test's own assertions,
      // not paired with the offsets `append` returned, so it cannot be
      // replayed as a snapshot; there is no stored state to expose.
      snapshot: () => Promise.resolve([]),
    } satisfies StreamDurability
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        try {
          yield ev.runStarted()
          yield ev.textContent('before cancel')
          // Still producing while the reader is gone.
          await proceed.promise
          yield ev.textContent('after cancel')
          yield ev.runFinished()
        } finally {
          sourceClosed.resolve()
        }
      },
    }
    const response = toServerSentEventsResponse(source, {
      abortController,
      durability: { adapter: durability, batch: 1 },
    })
    if (!response.body) throw new Error('Expected a response body')
    const reader = response.body.getReader()

    await reader.read() // RUN_STARTED
    await reader.cancel() // client disconnect — must not kill the run

    // The producer's own controller was NOT aborted by the disconnect.
    expect(abortController.signal.aborted).toBe(false)

    // Let the detached run finish; it drains the rest into the log.
    proceed.resolve()
    await sourceClosed.promise
    closing.resolve()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())

    // The log carries the run's REAL terminal, never a synthetic abort error.
    await vi.waitFor(() => expect(appended.at(-1)?.type).toBe('RUN_FINISHED'))
    expect(appended.some((chunk) => chunk.type === 'RUN_ERROR')).toBe(false)
    expect(
      appended.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT'),
    ).toBe(true)
  })

  it('persists a synthetic RUN_ERROR and awaits close when the producer is aborted', async () => {
    const abortController = new AbortController()
    const closing = deferred()
    const sourceClosed = deferred()
    const appended: Array<StreamChunk> = []
    const close = vi.fn(() => closing.promise)
    let seq = 0
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) => {
        appended.push(...chunks)
        return chunks.map(() => `backend:abort:${seq++}`)
      },
      read: async function* () {},
      close,
      snapshot: async () => [],
    } satisfies StreamDurability
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        try {
          yield ev.runStarted()
          yield ev.textContent('before abort')
          if (!abortController.signal.aborted) {
            await new Promise<void>((resolve) => {
              abortController.signal.addEventListener(
                'abort',
                () => resolve(),
                {
                  once: true,
                },
              )
            })
          }
        } finally {
          sourceClosed.resolve()
        }
      },
    }
    const response = toServerSentEventsResponse(source, {
      abortController,
      durability: { adapter: durability, batch: 1 },
    })
    if (!response.body) throw new Error('Expected a response body')
    const reader = response.body.getReader()

    await reader.read() // RUN_STARTED
    // A genuine caller abort (stop(), or a request signal) DOES stop the run.
    abortController.abort()

    await vi.waitFor(() => {
      expect(appended.at(-1)?.type).toBe('RUN_ERROR')
    })
    const terminal = appended.at(-1)
    expect(terminal).toMatchObject({
      type: 'RUN_ERROR',
      message: 'Request aborted',
      code: 'aborted',
      error: { message: 'Request aborted', code: 'aborted' },
    })
    closing.resolve()
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    await sourceClosed.promise
  })

  it('preserves a provider error when producer close also fails', async () => {
    const providerError = new Error('provider exploded')
    const closeError = new Error('close exploded')
    const appended: Array<StreamChunk> = []
    const close = vi.fn(async () => {
      throw closeError
    })
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) => {
        appended.push(...chunks)
        return chunks.map((_, index) => `backend:error:${index}`)
      },
      read: async function* () {},
      close,
      // Same as above: `appended` tracks chunks only, not the offsets
      // `append` returned, so there is no offset-paired state to snapshot.
      snapshot: () => Promise.resolve([]),
    } satisfies StreamDurability
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        yield ev.textContent('before error')
        throw providerError
      },
    }

    const events = parseEvents(
      await readBody(
        toServerSentEventsResponse(source, {
          durability: { adapter: durability, batch: 1 },
        }),
      ),
    )
    const persistedTerminal = appended.find(
      (chunk) => chunk.type === 'RUN_ERROR',
    )
    const liveTerminal = events.find(
      (event) => event.chunk.type === 'RUN_ERROR',
    )?.chunk

    expect(persistedTerminal).toMatchObject({
      type: 'RUN_ERROR',
      message: 'provider exploded',
    })
    expect(liveTerminal).toMatchObject({
      type: 'RUN_ERROR',
      message: expect.stringContaining('provider exploded'),
    })
    expect(liveTerminal).toMatchObject({
      error: {
        message: expect.stringContaining('close exploded'),
      },
    })
  })

  it('aggregates provider, terminal persistence, and close failures', async () => {
    const appended: Array<StreamChunk> = []
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) => {
        appended.push(...chunks)
        if (chunks.some((chunk) => chunk.type === 'RUN_ERROR')) {
          throw new Error('terminal persistence exploded')
        }
        return chunks.map((_, index) => `backend:aggregate:${index}`)
      },
      read: async function* () {},
      close: async () => {
        throw new Error('aggregate close exploded')
      },
      // Same as the other fakes above: `appended` tracks chunks only, not
      // the offsets `append` returned, so there is no state to snapshot.
      snapshot: () => Promise.resolve([]),
    } satisfies StreamDurability
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        yield ev.textContent('before aggregate')
        throw new Error('aggregate provider exploded')
      },
    }

    const events = parseEvents(
      await readBody(
        toServerSentEventsResponse(source, {
          durability: { adapter: durability, batch: 1 },
        }),
      ),
    )
    const liveTerminal = events.find(
      (event) => event.chunk.type === 'RUN_ERROR',
    )?.chunk

    expect(appended.at(-1)?.type).toBe('RUN_ERROR')
    expect(liveTerminal).toMatchObject({
      type: 'RUN_ERROR',
      message: expect.stringContaining('aggregate provider exploded'),
      error: {
        message: expect.stringContaining('terminal persistence exploded'),
      },
    })
    expect(liveTerminal).toMatchObject({
      error: {
        message: expect.stringContaining('aggregate close exploded'),
      },
    })
  })
})
