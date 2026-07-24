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

  it('persists an aborted RUN_ERROR and awaits close when the reader cancels', async () => {
    const abortController = new AbortController()
    const closing = deferred()
    const sourceClosed = deferred()
    const appended: Array<StreamChunk> = []
    const close = vi.fn(() => closing.promise)
    const durability = {
      resumeFrom: () => null,
      append: async (chunks: Array<StreamChunk>) => {
        appended.push(...chunks)
        return chunks.map((_, index) => `backend:cancel:${index}`)
      },
      read: async function* () {},
      close,
    } satisfies StreamDurability
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        try {
          yield ev.textContent('before cancel')
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

    await reader.read()
    const cancelPromise = reader.cancel()
    let cancelSettled = false
    void cancelPromise.then(() => {
      cancelSettled = true
    })

    await vi.waitFor(() => expect(abortController.signal.aborted).toBe(true))
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
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(cancelSettled).toBe(false)

    closing.resolve()
    await expect(cancelPromise).resolves.toBeUndefined()
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
