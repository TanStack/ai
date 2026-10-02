import { describe, expect, it, vi } from 'vitest'
import {
  fetchHttpStream,
  fetchServerSentEvents,
} from '../src/connection-adapters'

const chunk = { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' }

describe.each([
  ['SSE', fetchServerSentEvents, (data: string) => `data: ${data}\n\n`],
  ['NDJSON', fetchHttpStream, (data: string) => `${data}\n`],
] as const)('%s response cleanup', (_name, createAdapter, frame) => {
  function connection(
    data: string,
    close = false,
    onCancel?: () => void | Promise<void>,
  ) {
    const cancel = vi.fn(onCancel)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame(data)))
        if (close) controller.close()
      },
      cancel,
    })
    const adapter = createAdapter('/chat', {
      fetchClient: async () => new Response(body),
    })
    return { body, cancel, stream: adapter.connect([]) }
  }

  it('cancels the response when JSON parsing fails', async () => {
    const { body, cancel, stream } = connection('{invalid json}')
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      SyntaxError,
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it.each([false, true])(
    'cancels the response on early return (pending cancellation: %s)',
    async (pendingCancellation) => {
      const { body, cancel, stream } = connection(
        JSON.stringify(chunk),
        false,
        pendingCancellation ? () => new Promise<void>(() => {}) : undefined,
      )
      for await (const received of stream) {
        expect(received).toMatchObject(chunk)
        break
      }
      expect(cancel).toHaveBeenCalledOnce()
      expect(body.locked).toBe(false)
    },
  )

  it.each(['throws', 'rejects', 'never settles'] as const)(
    'preserves a parse error when cancellation %s',
    async (behavior) => {
      const { body, cancel, stream } = connection(
        '{invalid json}',
        false,
        () => {
          const error = new Error('cleanup failed')
          if (behavior === 'throws') throw error
          if (behavior === 'rejects') return Promise.reject(error)
          return new Promise<void>(() => {})
        },
      )
      await expect(
        stream[Symbol.asyncIterator]().next(),
      ).rejects.toBeInstanceOf(SyntaxError)
      expect(cancel).toHaveBeenCalledOnce()
      expect(body.locked).toBe(false)
    },
  )

  it('drains a normally closed response without canceling its source', async () => {
    const { body, cancel, stream } = connection(JSON.stringify(chunk), true)
    const chunks = []
    for await (const received of stream) chunks.push(received)
    expect(chunks).toEqual([chunk])
    expect(cancel).not.toHaveBeenCalled()
    expect(body.locked).toBe(false)
  })
})

it('cancels an SSE response after the DONE sentinel', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
    },
    cancel,
  })
  const adapter = fetchServerSentEvents('/chat', {
    fetchClient: async () => new Response(body),
  })
  const chunks = []
  for await (const received of adapter.connect([])) chunks.push(received)
  expect(chunks).toEqual([expect.objectContaining({ type: 'RUN_FINISHED' })])
  expect(cancel).toHaveBeenCalledOnce()
  expect(body.locked).toBe(false)
})
