import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAudioRecorder } from '../src/create-audio-recorder.svelte'
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

describe('createAudioRecorder (svelte)', () => {
  it('toggles isRecording and resolves a recording', async () => {
    const recorder = createAudioRecorder()
    expect(recorder.isSupported).toBe(true)
    expect(recorder.isRecording).toBe(false)

    await recorder.start()
    expect(recorder.isRecording).toBe(true)

    const rec = await recorder.stop()
    expect(recorder.isRecording).toBe(false)
    expect(rec.base64).toBe('AQID')
    expect(rec.part.type).toBe('audio')
    expect(recorder.recording?.base64).toBe('AQID')
  })

  it('applies the onComplete transform to stop() and recording', async () => {
    const recorder = createAudioRecorder({
      onComplete: (r: AudioRecording) => r.base64,
    })
    await recorder.start()
    const out = await recorder.stop()
    expect(out).toBe('AQID')
    expect(recorder.recording).toBe('AQID')
  })

  it('surfaces a getUserMedia rejection through onError and rejects start()', async () => {
    const denied = new Error('Permission denied')
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(denied)) },
    })
    const onError = vi.fn()
    const recorder = createAudioRecorder({ onError })

    await expect(recorder.start()).rejects.toThrow('Permission denied')
    expect(onError).toHaveBeenCalledWith(denied)
    expect(recorder.isRecording).toBe(false)
  })
})
