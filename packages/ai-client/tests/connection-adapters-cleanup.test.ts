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
  function connection(data: string, close = false, cancelError?: Error) {
    const cancel = vi.fn(() => {
      if (cancelError) throw cancelError
    })
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

  it('cancels the response when the consumer stops early', async () => {
    const { body, cancel, stream } = connection(JSON.stringify(chunk))
    for await (const received of stream) {
      expect(received).toMatchObject(chunk)
      break
    }
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it('preserves a parse error when cancellation rejects', async () => {
    const { body, cancel, stream } = connection(
      '{invalid json}',
      false,
      new Error('cleanup failed'),
    )
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      SyntaxError,
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

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
