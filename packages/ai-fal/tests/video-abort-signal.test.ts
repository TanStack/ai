import { describe, expect, it, vi } from 'vitest'
import { falVideo } from '../src/adapters/video'

/** Records the queue options; hangs until their `abortSignal` aborts. */
const mocks = vi.hoisted(() => {
  const signals: Array<AbortSignal | undefined> = []
  const hang = (_endpoint: string, options: { abortSignal?: AbortSignal }) => {
    const signal = options.abortSignal
    signals.push(signal)
    if (!signal) return Promise.reject(new Error('request had no signal'))
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  }
  return { signals, hang }
})

vi.mock('../src/client', () => ({
  createFalClient: () => ({
    queue: { status: mocks.hang, result: mocks.hang, cancel: mocks.hang },
  }),
}))

describe('fal video forwards abortSignal to the queue', () => {
  it.each(['getVideoStatus', 'getVideo', 'cancelVideoJob'] as const)(
    '%s',
    async (method) => {
      mocks.signals.length = 0
      const adapter = falVideo('fal-ai/veo3/image-to-video', { apiKey: 'k' })
      const controller = new AbortController()
      const pending = adapter[method]('job-1', {
        abortSignal: controller.signal,
      })
      await vi.waitFor(() => expect(mocks.signals).toHaveLength(1))
      expect(mocks.signals[0]).toBe(controller.signal)
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    },
  )
})
