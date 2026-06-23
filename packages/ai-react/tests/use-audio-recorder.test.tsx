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

  it('sets content to the raw AudioRecording when no onComplete is provided', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    expect(result.current.content).toBeNull()

    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      await result.current.stop()
    })

    expect(result.current.content).not.toBeNull()
    expect(result.current.content?.base64).toBe('AQID')
    expect(result.current.content?.part.type).toBe('audio')
  })

  it('onComplete transform re-types stop() and content', async () => {
    const { result } = renderHook(() =>
      useAudioRecorder({ onComplete: (rec) => rec.base64 }),
    )

    expect(result.current.content).toBeNull()

    await act(async () => {
      await result.current.start()
    })

    let output: any
    await act(async () => {
      output = await result.current.stop()
    })

    expect(output).toBe('AQID')
    expect(result.current.content).toBe('AQID')
  })
})
