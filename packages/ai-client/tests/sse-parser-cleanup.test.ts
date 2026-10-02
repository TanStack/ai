import { expect, it, vi } from 'vitest'
import { parseSSEResponse } from '../src/sse-parser'
import { GenerationClient } from '../src/generation-client'

const chunk = { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' }
const frame = `data: ${JSON.stringify(chunk)}\n\n`

it.each(['resolves', 'throws', 'rejects', 'never settles'] as const)(
  'cancels a generation response on early return when cancellation %s',
  async (behavior) => {
    const cancel = vi.fn(() => {
      const error = new Error('cleanup failed')
      if (behavior === 'throws') throw error
      if (behavior === 'rejects') return Promise.reject(error)
      if (behavior === 'never settles') return new Promise<void>(() => {})
      return undefined
    })
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame))
      },
      cancel,
    })
    for await (const received of parseSSEResponse(new Response(body))) {
      expect(received).toEqual(chunk)
      break
    }
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  },
)

it('reports a generation error without waiting for custom cancellation', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}))
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"RUN_ERROR","message":"generation failed"}\n\n',
        ),
      )
    },
    cancel,
  })
  const client = new GenerationClient({
    fetcher: async () => new Response(body),
  })
  try {
    await client.generate({})
    expect(client.getError()?.message).toBe('generation failed')
    expect(client.getIsLoading()).toBe(false)
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  } finally {
    client.dispose()
  }
})

it('preserves generation reader errors and releases the lock', async () => {
  const error = new Error('response reader failed')
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error)
    },
  })
  await expect(parseSSEResponse(new Response(body)).next()).rejects.toBe(error)
  expect(body.locked).toBe(false)
})

it('drains generation EOF and keeps ignoring malformed JSON and DONE markers', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: {invalid json}\n\ndata: [DONE]\n\n${frame}`,
        ),
      )
      controller.close()
    },
    cancel,
  })
  try {
    const chunks = []
    for await (const received of parseSSEResponse(new Response(body)))
      chunks.push(received)
    expect(chunks).toEqual([chunk])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(cancel).not.toHaveBeenCalled()
    expect(body.locked).toBe(false)
  } finally {
    warn.mockRestore()
  }
})
