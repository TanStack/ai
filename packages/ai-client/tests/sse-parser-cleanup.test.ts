import { expect, it, vi } from 'vitest'
import { parseSSEResponse } from '../src/sse-parser'

const chunk = { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' }
const frame = `data: ${JSON.stringify(chunk)}\n\n`

it.each([false, true])(
  'cancels a generation response on early return (cancellation rejects: %s)',
  async (rejectCancellation) => {
    const cancel = vi.fn(() => {
      if (rejectCancellation) throw new Error('cleanup failed')
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
