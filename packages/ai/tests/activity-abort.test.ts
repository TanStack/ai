import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImage } from '../src/index'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { ImageAdapter } from '../src/activities/generateImage/adapter'

function createMockImageAdapter(
  overrides?: Partial<{
    generateImages: (...args: Array<any>) => Promise<any>
  }>,
): ImageAdapter {
  return {
    kind: 'image' as const,
    name: 'test-image',
    model: 'test-model',
    '~types': {} as any,
    generateImages:
      overrides?.generateImages ??
      vi.fn(async () => ({
        id: 'img-1',
        model: 'test-model',
        images: [{ url: 'https://example.com/image.png' }],
      })),
  }
}

describe('generateImage abortSignal + timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('forwards the composed abortSignal to the media adapter', async () => {
    const generateImages = vi.fn(async (opts: { abortSignal?: AbortSignal }) => {
      expect(opts.abortSignal).toBeInstanceOf(AbortSignal)
      expect(opts.abortSignal?.aborted).toBe(false)
      return {
        id: 'img-1',
        model: 'test-model',
        images: [{ url: 'https://example.com/image.png' }],
      }
    })
    const adapter = createMockImageAdapter({ generateImages })
    const controller = new AbortController()

    await generateImage({
      adapter,
      prompt: 'a cat',
      abortSignal: controller.signal,
    })

    expect(generateImages).toHaveBeenCalledTimes(1)
    const passed = generateImages.mock.calls[0]![0] as {
      abortSignal?: AbortSignal
    }
    expect(passed.abortSignal).toBeDefined()
  })

  it('timeout aborts and is forwarded to the media adapter', async () => {
    vi.useFakeTimers()
    let seenSignal: AbortSignal | undefined
    const generateImages = vi.fn(
      (_opts: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, _reject) => {
          seenSignal = _opts.abortSignal
          // Never resolves — activity timeout must win.
        }),
    )
    const adapter = createMockImageAdapter({ generateImages })

    const promise = generateImage({
      adapter,
      prompt: 'a cat',
      timeout: 50,
    })
    // Attach rejection handler before timers fire to avoid unhandled rejections.
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'TimeoutError',
      message: expect.stringContaining('timed out'),
    })

    // Allow the adapter call to start, then advance past the timeout.
    await vi.advanceTimersByTimeAsync(0)
    expect(seenSignal).toBeInstanceOf(AbortSignal)
    expect(seenSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(seenSignal?.aborted).toBe(true)
  })

  it('caller-provided signal aborts and first abort reason wins', async () => {
    const generateImages = vi.fn(
      (opts: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.abortSignal?.addEventListener(
            'abort',
            () => {
              reject(
                opts.abortSignal?.reason instanceof Error
                  ? opts.abortSignal.reason
                  : Object.assign(new Error('aborted'), { name: 'AbortError' }),
              )
            },
            { once: true },
          )
        }),
    )
    const adapter = createMockImageAdapter({ generateImages })
    const controller = new AbortController()

    const promise = generateImage({
      adapter,
      prompt: 'a cat',
      abortSignal: controller.signal,
      timeout: 60_000,
    })
    const assertion = expect(promise).rejects.toMatchObject({
      message: 'caller cancelled',
    })

    // Let the adapter attach its listener.
    await Promise.resolve()
    controller.abort(new Error('caller cancelled'))

    await assertion
  })

  it('successful completion clears the timer (no late abort)', async () => {
    vi.useFakeTimers()
    const generateImages = vi.fn(async () => ({
      id: 'img-1',
      model: 'test-model',
      images: [{ url: 'https://example.com/image.png' }],
    }))
    const adapter = createMockImageAdapter({ generateImages })

    const resultPromise = generateImage({
      adapter,
      prompt: 'a cat',
      timeout: 1_000,
    })

    await expect(resultPromise).resolves.toMatchObject({
      id: 'img-1',
    })

    // Advancing past the original timeout must not throw or leave a hanging
    // timer that would abort a subsequent unrelated operation.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(generateImages).toHaveBeenCalledTimes(1)
  })

  it('timeout triggers onAbort exactly once rather than onError', async () => {
    vi.useFakeTimers()
    const generateImages = vi.fn(
      () =>
        new Promise(() => {
          // hang
        }),
    )
    const adapter = createMockImageAdapter({ generateImages })

    const onAbort = vi.fn()
    const onError = vi.fn()
    const onFinish = vi.fn()
    const middleware: Array<GenerationMiddleware> = [
      {
        name: 'test-abort',
        onAbort,
        onError,
        onFinish,
      },
    ]

    const promise = generateImage({
      adapter,
      prompt: 'a cat',
      timeout: 25,
      middleware,
    })
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'TimeoutError',
    })

    await vi.advanceTimersByTimeAsync(25)
    await assertion

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(onFinish).not.toHaveBeenCalled()
    expect(onAbort.mock.calls[0]![1]).toMatchObject({
      reason: expect.stringContaining('timed out'),
      duration: expect.any(Number),
    })
  })

  it('caller abort triggers onAbort exactly once', async () => {
    const generateImages = vi.fn(
      (opts: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.abortSignal?.addEventListener(
            'abort',
            () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              ),
            { once: true },
          )
        }),
    )
    const adapter = createMockImageAdapter({ generateImages })
    const controller = new AbortController()

    const onAbort = vi.fn()
    const onError = vi.fn()
    const middleware: Array<GenerationMiddleware> = [
      { name: 'test-abort', onAbort, onError },
    ]

    const promise = generateImage({
      adapter,
      prompt: 'a cat',
      abortSignal: controller.signal,
      middleware,
    })
    const assertion = expect(promise).rejects.toBeTruthy()

    await Promise.resolve()
    controller.abort()
    await assertion

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})
