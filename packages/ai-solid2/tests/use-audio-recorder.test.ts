import { flush } from 'solid-js'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
import { renderHook } from '@solidjs/testing-library'
import { useAudioRecorder } from '../src/use-audio-recorder'
import type { AudioRecording } from '@tanstack/ai-client'

// Blob.prototype.arrayBuffer is polyfilled for jsdom in tests/setup.ts.

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  state: 'inactive' | 'recording' = 'inactive'
  constructor(
    public stream: any,
    public options?: { mimeType?: string },
  ) {}
  get mimeType(): string {
    return this.options?.mimeType ?? 'audio/webm'
  }
  start(): void {
    this.state = 'recording'
  }
  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAudioRecorder (solid2)', () => {
  it('toggles isRecording and resolves a recording', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.isSupported).toBe(true)
    expect(result.isRecording()).toBe(false)

    flush()
    await result.start()
    expect(result.isRecording()).toBe(true)

    const rec = await result.stop()
    flush()
    expect(result.isRecording()).toBe(false)
    expect(rec.base64).toBe('AQID')
    expect(rec.part.type).toBe('audio')
    expect(result.recording()?.base64).toBe('AQID')
  })

  it('applies the onComplete transform to stop() and recording()', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: (r) => r.base64 }),
    )
    flush()
    await result.start()
    const out = await result.stop()
    flush()
    expect(out).toBe('AQID')
    expect(result.recording()).toBe('AQID')
  })

  it('preserves a null returned from onComplete (only undefined keeps the raw recording)', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: () => null }),
    )
    flush()
    await result.start()
    const out = await result.stop()
    flush()
    expect(out).toBeNull()
    expect(result.recording()).toBeNull()
  })

  it.each(['sync', 'async'] as const)(
    'reports %s transform failures without replacing the stop rejection',
    async (mode) => {
      const error = new Error('Transform failed')
      const onError = vi.fn(() => {
        throw new Error('Error handler failed')
      })
      const { result } = renderHook(() =>
        useAudioRecorder({
          onComplete: () => {
            if (mode === 'async') return Promise.reject(error)
            throw error
          },
          onError,
        }),
      )
      flush()
      await result.start()

      await expect(result.stop()).rejects.toBe(error)
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(result.recording()).toBeNull()
      expect(result.isRecording()).toBe(false)
    },
  )

  it('keeps the latest recording when an older transform completes late', async () => {
    let finishFirst!: (value: string) => void
    const firstTransform = new Promise<string>((resolve) => {
      finishFirst = resolve
    })
    const onComplete = vi
      .fn()
      .mockReturnValueOnce(firstTransform)
      .mockReturnValueOnce('second')
    const { result } = renderHook(() => useAudioRecorder({ onComplete }))
    flush()
    await result.start()
    const firstStop = result.stop()
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))

    await result.start()
    expect(result.isRecording()).toBe(true)
    await expect(result.stop()).resolves.toBe('second')
    expect(result.recording()).toBe('second')

    finishFirst('first')
    await expect(firstStop).resolves.toBe('first')
    expect(result.recording()).toBe('second')
  })

  it('does not invalidate a valid stop when a concurrent stop is rejected', async () => {
    const onComplete = vi.fn((rec: AudioRecording) => rec.base64)
    const { result } = renderHook(() => useAudioRecorder({ onComplete }))
    flush()
    await result.start()
    const stopping = result.stop()

    await expect(result.stop()).rejects.toThrow('called while not recording')
    await expect(stopping).resolves.toBe('AQID')
    expect(result.recording()).toBe('AQID')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not invalidate a pending transform when an idle stop is rejected', async () => {
    let finish!: (value: string) => void
    const pendingTransform = new Promise<string>((resolve) => {
      finish = resolve
    })
    const onComplete = vi.fn(() => pendingTransform)
    const { result } = renderHook(() => useAudioRecorder({ onComplete }))
    flush()
    await result.start()
    const stopping = result.stop()
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())

    await expect(result.stop()).rejects.toThrow('called while not recording')
    finish('complete')
    await expect(stopping).resolves.toBe('complete')
    expect(result.recording()).toBe('complete')
  })

  it('does not report a media failure twice', async () => {
    const error = new Error('Failed to read recording')
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockRejectedValueOnce(error)
    const onError = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useAudioRecorder({ onError, onComplete }),
    )
    flush()
    await result.start()

    await expect(result.stop()).rejects.toBe(error)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not publish a pending transform after cleanup', async () => {
    let finish!: (value: string) => void
    const pendingTransform = new Promise<string>((resolve) => {
      finish = resolve
    })
    const onComplete = vi.fn(() => pendingTransform)
    const { result, cleanup } = renderHook(() =>
      useAudioRecorder({ onComplete }),
    )
    flush()
    await result.start()
    const stopping = result.stop()
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    cleanup()

    finish('late')
    await expect(stopping).resolves.toBe('late')
    expect(result.recording()).toBeNull()
  })

  it('does not call onError for a transform that rejects after cleanup', async () => {
    let reject!: (error: Error) => void
    const pendingTransform = new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise
    })
    const onError = vi.fn()
    const onComplete = vi.fn(() => pendingTransform)
    const { result, cleanup } = renderHook(() =>
      useAudioRecorder({ onComplete, onError }),
    )
    flush()
    await result.start()
    const stopping = result.stop()
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    cleanup()

    const error = new Error('Late transform failure')
    reject(error)
    await expect(stopping).rejects.toBe(error)
    expect(onError).not.toHaveBeenCalled()
    expect(result.recording()).toBeNull()
  })

  it('does not start a transform if cleanup follows media finalization', async () => {
    const onComplete = vi.fn((rec: AudioRecording) => rec.base64)
    const { result, cleanup } = renderHook(() =>
      useAudioRecorder({ onComplete }),
    )
    flush()
    await result.start()
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockResolvedValueOnce(
      new Uint8Array([1, 2, 3]).buffer,
    )
    const stopping = result.stop()
    // Finalize reaches idle before the hook resumes its stop continuation.
    await Promise.resolve()
    expect(result.isRecording()).toBe(false)
    cleanup()

    await expect(stopping).rejects.toThrow('Recording cancelled')
    expect(onComplete).not.toHaveBeenCalled()
    expect(result.recording()).toBeNull()
  })

  it('does not call onError for a microphone request rejected after cleanup', async () => {
    let reject!: (error: Error) => void
    const microphone = new Promise<MediaStream>((_resolve, rejectPromise) => {
      reject = rejectPromise
    })
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => microphone },
    })
    const onError = vi.fn()
    const { result, cleanup } = renderHook(() => useAudioRecorder({ onError }))
    flush()
    const starting = result.start()
    cleanup()

    const error = new Error('Permission denied')
    reject(error)
    await expect(starting).rejects.toBe(error)
    expect(onError).not.toHaveBeenCalled()
  })

  it('releases the mic on cleanup', async () => {
    const trackStop = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: trackStop }],
        })),
      },
    })
    const { result, cleanup } = renderHook(() => useAudioRecorder())
    flush()
    await result.start()
    expect(result.isRecording()).toBe(true)

    // onCleanup must cancel the in-flight recording so the mic tracks stop.
    cleanup()
    expect(trackStop).toHaveBeenCalled()
  })
})

describe('useAudioRecorder (solid2) type inference', () => {
  it('re-types stop()/recording() from onComplete and falls back otherwise', () => {
    // Compile-time only: never invoked, so the recorder is never constructed.
    const _types = () => {
      const withTransform = useAudioRecorder({
        onComplete: (rec) => rec.base64,
      })
      expectTypeOf(withTransform.stop()).resolves.toBeString()
      expectTypeOf(withTransform.recording()).toEqualTypeOf<string | null>()

      const raw = useAudioRecorder()
      expectTypeOf(raw.stop()).resolves.toEqualTypeOf<AudioRecording>()
      expectTypeOf(raw.recording()).toEqualTypeOf<AudioRecording | null>()

      const withVoid = useAudioRecorder({ onComplete: () => {} })
      expectTypeOf(withVoid.stop()).resolves.toEqualTypeOf<AudioRecording>()
      const withUndefined = useAudioRecorder({ onComplete: () => undefined })
      expectTypeOf(
        withUndefined.stop(),
      ).resolves.toEqualTypeOf<AudioRecording>()
      const withNull = useAudioRecorder({ onComplete: () => null })
      expectTypeOf(withNull.stop()).resolves.toBeNull()
      const asyncTransform = useAudioRecorder({
        onComplete: async (rec) => rec.base64,
      })
      expectTypeOf(asyncTransform.stop()).resolves.toBeString()
    }
    expect(typeof _types).toBe('function')
  })

  it('includes raw recordings when a transform conditionally returns nothing', () => {
    const _types = (condition: boolean) => {
      const conditional = useAudioRecorder({
        onComplete: (rec) => (condition ? rec.base64 : undefined),
      })
      expectTypeOf(conditional.stop()).resolves.toEqualTypeOf<
        string | AudioRecording
      >()
      expectTypeOf(conditional.recording()).toEqualTypeOf<
        string | AudioRecording | null
      >()

      const asyncConditional = useAudioRecorder({
        onComplete: async (rec) => (condition ? rec.base64 : undefined),
      })
      expectTypeOf(asyncConditional.stop()).resolves.toEqualTypeOf<
        string | AudioRecording
      >()

      const voidConditional = useAudioRecorder({
        onComplete: (rec): string | void => {
          if (condition) return rec.base64
        },
      })
      expectTypeOf(voidConditional.stop()).resolves.toEqualTypeOf<
        string | AudioRecording
      >()
    }
    expect(typeof _types).toBe('function')
  })

  it('keeps AudioRecording when options carry no onComplete (issue #1001)', () => {
    const _types = () => {
      const { recording, stop } = useAudioRecorder({
        onError: (_error: Error) => {},
      })

      expectTypeOf(recording()).not.toBeUnknown()
      expectTypeOf(recording()).toEqualTypeOf<AudioRecording | null>()
      expectTypeOf(stop).returns.toEqualTypeOf<Promise<AudioRecording>>()

      const value = recording()
      if (value) {
        expectTypeOf(value.base64).toBeString()
      }
    }
    expect(typeof _types).toBe('function')
  })
})
