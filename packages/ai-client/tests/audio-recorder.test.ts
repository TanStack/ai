import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioRecorder } from '../src'

// Minimal fake MediaRecorder we can drive synchronously from tests.
class FakeMediaRecorder {
  static lastInstance: FakeMediaRecorder | null = null
  static isTypeSupported = vi.fn((_type: string) => true)
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((e: { error?: Error }) => void) | null = null
  state: 'inactive' | 'recording' = 'inactive'
  constructor(
    public stream: any,
    public options?: { mimeType?: string },
  ) {
    FakeMediaRecorder.lastInstance = this
  }
  get mimeType(): string {
    return this.options?.mimeType ?? 'audio/webm'
  }
  start(): void {
    this.state = 'recording'
  }
  // Emit one chunk then fire onstop, mimicking the real teardown order.
  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) })
    this.onstop?.()
  }
  // Trigger onerror with an event carrying an `error` property.
  triggerError(error: Error): void {
    this.onerror?.({ error })
  }
}

// Variant that emits a chunk but never calls onstop — the watchdog should
// recover the buffered audio from this.
class FakeMediaRecorderNoStop extends FakeMediaRecorder {
  override stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) })
    // Intentionally does NOT call this.onstop?.()
  }
}

// Variant that emits no chunk and never calls onstop — the watchdog has
// nothing to recover and must reject.
class FakeMediaRecorderNoStopNoData extends FakeMediaRecorder {
  override stop(): void {
    this.state = 'inactive'
    // No ondataavailable, no onstop.
  }
}

function makeStream() {
  const track = { stop: vi.fn() }
  return {
    getTracks: () => [track],
    _track: track,
  }
}

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  getUserMedia = vi.fn(async () => makeStream())
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  FakeMediaRecorder.lastInstance = null
  FakeMediaRecorder.isTypeSupported = vi.fn(() => true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AudioRecorder', () => {
  it('isSupported() is true when media APIs exist', () => {
    expect(AudioRecorder.isSupported()).toBe(true)
  })

  it('isSupported() is false when MediaRecorder is missing', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(AudioRecorder.isSupported()).toBe(false)
  })

  it('records start->stop and produces base64 + a ready audio part', async () => {
    const recorder = new AudioRecorder()
    const states: Array<string> = []
    recorder.subscribe((s) => states.push(s))

    await recorder.start()
    expect(recorder.state).toBe('recording')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })

    const recording = await recorder.stop()
    expect(recording.mimeType).toBe('audio/webm')
    expect(recording.base64).toBe('AQID') // base64 of [1,2,3]
    expect(recording.part).toEqual({
      type: 'audio',
      source: { type: 'data', value: 'AQID', mimeType: 'audio/webm' },
    })
    expect(typeof recording.durationMs).toBe('number')
    expect(recorder.state).toBe('idle')
    expect(states).toContain('recording')
    expect(states).toContain('idle')
  })

  it('stops microphone tracks on stop', async () => {
    const stream = makeStream()
    getUserMedia.mockResolvedValueOnce(stream)
    const recorder = new AudioRecorder()
    await recorder.start()
    await recorder.stop()
    expect(stream._track.stop).toHaveBeenCalled()
  })

  it('routes getUserMedia rejection to onError and rethrows', async () => {
    const onError = vi.fn()
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
    const recorder = new AudioRecorder({ onError })
    await expect(recorder.start()).rejects.toThrow('Permission denied')
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(recorder.state).toBe('idle')
  })

  it('cancel() releases the mic and produces no recording', async () => {
    const stream = makeStream()
    getUserMedia.mockResolvedValueOnce(stream)
    const recorder = new AudioRecorder()
    await recorder.start()
    recorder.cancel()
    expect(stream._track.stop).toHaveBeenCalled()
    expect(recorder.state).toBe('idle')
  })

  it('rejects stop() when not recording', async () => {
    const recorder = new AudioRecorder()
    await expect(recorder.stop()).rejects.toThrow(/not recording/)
  })

  it('honors a supported custom mimeType', async () => {
    const recorder = new AudioRecorder({ mimeType: 'audio/mp4' })
    await recorder.start()
    expect(FakeMediaRecorder.lastInstance?.options?.mimeType).toBe('audio/mp4')
    await recorder.stop()
  })

  it('onerror preserves the underlying error detail', async () => {
    const onError = vi.fn()
    const recorder = new AudioRecorder({ onError })
    await recorder.start()
    const fake = FakeMediaRecorder.lastInstance!
    fake.triggerError(new Error('NotAllowedError'))
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'NotAllowedError' }),
    )
    expect(recorder.state).toBe('idle')
  })

  it('cancel during finalize settles stop() exactly once', async () => {
    const recorder = new AudioRecorder()
    await recorder.start()

    let resolved = 0
    let rejected = 0
    // The sync fake fires onstop -> finalize(), which then suspends on the
    // async blob.arrayBuffer(). We cancel before that microtask runs, so the
    // pending stop() must reject exactly once and finalize's late resolve must
    // be a no-op.
    const settled = recorder.stop().then(
      () => {
        resolved++
      },
      () => {
        rejected++
      },
    )
    recorder.cancel()
    await settled
    await Promise.resolve()
    await Promise.resolve()

    expect(rejected).toBe(1)
    expect(resolved).toBe(0)
    expect(recorder.state).toBe('idle')
  })

  it('routes a finalize failure to onError and rejects stop()', async () => {
    const onError = vi.fn()
    const recorder = new AudioRecorder({ onError })
    await recorder.start()
    const spy = vi
      .spyOn(Blob.prototype, 'arrayBuffer')
      .mockRejectedValueOnce(new Error('decode failed'))

    await expect(recorder.stop()).rejects.toThrow('decode failed')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'decode failed' }),
    )
    expect(recorder.state).toBe('idle')
    spy.mockRestore()
  })

  it('a throwing onError still rejects the pending stop() promise', async () => {
    // Users are told to handle one error channel, not both — a stop()-rejection
    // handler may legitimately let onError throw. That throw must not strand the
    // pending stop() promise (onError is settled after reject, and isolated).
    const onError = vi.fn(() => {
      throw new Error('user handler blew up')
    })
    const recorder = new AudioRecorder({ onError })
    await recorder.start()
    const spy = vi
      .spyOn(Blob.prototype, 'arrayBuffer')
      .mockRejectedValueOnce(new Error('decode failed'))

    await expect(recorder.stop()).rejects.toThrow('decode failed')
    expect(onError).toHaveBeenCalled()
    expect(recorder.state).toBe('idle')
    spy.mockRestore()
  })

  it('stop() watchdog recovers buffered audio when onstop never fires', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('MediaRecorder', FakeMediaRecorderNoStop)
      const recorder = new AudioRecorder()
      await recorder.start()
      let recording: unknown
      const stopPromise = recorder.stop().then((rec) => {
        recording = rec
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await stopPromise
      // The chunk delivered before the stalled onstop is finalized rather than
      // discarded.
      expect(recording).toEqual(
        expect.objectContaining({ base64: 'AQID', mimeType: 'audio/webm' }),
      )
      expect(recorder.state).toBe('idle')
    } finally {
      vi.useRealTimers()
      vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    }
  })

  it('stop() watchdog rejects when no audio was captured', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('MediaRecorder', FakeMediaRecorderNoStopNoData)
      const recorder = new AudioRecorder()
      await recorder.start()
      // Capture rejection synchronously before advancing timers so the
      // rejection is never "unhandled" in the microtask queue.
      let capturedError: unknown
      const stopPromise = recorder.stop().then(
        () => {
          throw new Error('expected rejection')
        },
        (e: unknown) => {
          capturedError = e
        },
      )
      await vi.advanceTimersByTimeAsync(10_000)
      await stopPromise
      expect(capturedError).toBeInstanceOf(Error)
      expect((capturedError as Error).message).toMatch(/timed out/)
      expect(recorder.state).toBe('idle')
    } finally {
      vi.useRealTimers()
      vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    }
  })

  it('cancel() during a pending start() releases the mic and never records', async () => {
    const stream = makeStream()
    let resolveStream: (s: any) => void = () => {}
    // Hold getUserMedia open so we can cancel mid-acquisition.
    getUserMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStream = resolve
      }),
    )
    const recorder = new AudioRecorder()
    const startPromise = recorder.start()
    // Cancel while getUserMedia is still pending (state is still 'idle').
    recorder.cancel()
    resolveStream(stream)
    await startPromise

    // The freshly acquired stream must be torn down, and we must not be live.
    expect(stream._track.stop).toHaveBeenCalled()
    expect(recorder.state).toBe('idle')

    // A subsequent start() must still work normally.
    getUserMedia.mockResolvedValueOnce(makeStream())
    await recorder.start()
    expect(recorder.state).toBe('recording')
    await recorder.stop()
  })
})
