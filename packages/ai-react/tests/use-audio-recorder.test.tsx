import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAudioRecorder } from '../src/use-audio-recorder'

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

describe('useAudioRecorder', () => {
  it('exposes isSupported and toggles isRecording across start/stop', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.current.isSupported).toBe(true)
    expect(result.current.isRecording).toBe(false)

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.isRecording).toBe(true)

    let recording: any
    await act(async () => {
      recording = await result.current.stop()
    })
    expect(result.current.isRecording).toBe(false)
    expect(recording.part.type).toBe('audio')
    expect(recording.base64).toBe('AQID')
  })

  it('sets recording to the raw AudioRecording when no onComplete is provided', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    expect(result.current.recording).toBeNull()

    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      await result.current.stop()
    })

    expect(result.current.recording).not.toBeNull()
    expect(result.current.recording?.base64).toBe('AQID')
    expect(result.current.recording?.part.type).toBe('audio')
  })

  it('onComplete transform re-types stop() and recording', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: (rec) => rec.base64 }),
    )

    expect(result.current.recording).toBeNull()

    await act(async () => {
      await result.current.start()
    })

    let output: any
    await act(async () => {
      output = await result.current.stop()
    })

    expect(output).toBe('AQID')
    expect(result.current.recording).toBe('AQID')
  })

  it('preserves a null returned from onComplete (only undefined keeps the raw recording)', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: () => null }),
    )

    await act(async () => {
      await result.current.start()
    })

    let output: any
    await act(async () => {
      output = await result.current.stop()
    })

    expect(output).toBeNull()
    expect(result.current.recording).toBeNull()
  })

  it('surfaces a getUserMedia rejection through onError and rejects start()', async () => {
    const denied = new Error('Permission denied')
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(denied)) },
    })
    const onError = vi.fn()
    const { result } = renderHook(() => useAudioRecorder({ onError }))

    await act(async () => {
      await expect(result.current.start()).rejects.toThrow('Permission denied')
    })
    expect(onError).toHaveBeenCalledWith(denied)
    expect(result.current.isRecording).toBe(false)
  })

  it('releases the mic and clears isRecording on unmount', async () => {
    const trackStop = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: trackStop }],
        })),
      },
    })
    const { result, unmount } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.isRecording).toBe(true)

    // The effect cleanup must unsubscribe and cancel the in-flight recording so
    // the microphone tracks stop — a dropped cleanup would leak a live mic.
    unmount()
    expect(trackStop).toHaveBeenCalled()
  })
})
