import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioRecorder } from '../src'

// Minimal fake MediaRecorder we can drive synchronously from tests.
class FakeMediaRecorder {
  static lastInstance: FakeMediaRecorder | null = null
  static isTypeSupported = vi.fn((_type: string) => true)
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
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
    const onComplete = vi.fn()
    const recorder = new AudioRecorder({ onComplete })
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
    expect(onComplete).toHaveBeenCalledWith(recording)
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
    const onComplete = vi.fn()
    const recorder = new AudioRecorder({ onComplete })
    await recorder.start()
    recorder.cancel()
    expect(stream._track.stop).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
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
})
