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
  vi.unstubAllGlobals()
})

describe('useAudioRecorder (solid)', () => {
  it('toggles isRecording and resolves a recording', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.isSupported).toBe(true)
    expect(result.isRecording()).toBe(false)

    await result.start()
    expect(result.isRecording()).toBe(true)

    const rec = await result.stop()
    expect(result.isRecording()).toBe(false)
    expect(rec.base64).toBe('AQID')
    expect(rec.part.type).toBe('audio')
    expect(result.recording()?.base64).toBe('AQID')
  })

  it('applies the onComplete transform to stop() and recording()', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: (r) => r.base64 }),
    )
    await result.start()
    const out = await result.stop()
    expect(out).toBe('AQID')
    expect(result.recording()).toBe('AQID')
  })

  it('preserves a null returned from onComplete (only undefined keeps the raw recording)', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: () => null }),
    )
    await result.start()
    const out = await result.stop()
    expect(out).toBeNull()
    expect(result.recording()).toBeNull()
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
    await result.start()
    expect(result.isRecording()).toBe(true)

    // onCleanup must cancel the in-flight recording so the mic tracks stop.
    cleanup()
    expect(trackStop).toHaveBeenCalled()
  })
})

describe('useAudioRecorder (solid) type inference', () => {
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
    }
    expect(typeof _types).toBe('function')
  })
})
