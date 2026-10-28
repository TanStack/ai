import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAudioRecorder } from '../src/create-audio-recorder'
import type { FrameHandle, Handle } from 'remix/ui'

class FakeMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start() {}
  stop() {}
}

function createFrameHandle(): FrameHandle {
  return Object.assign(new EventTarget(), {
    src: '',
    async reload() {
      return new AbortController().signal
    },
    async replace() {},
  })
}

function createTestHandle() {
  const controller = new AbortController()
  const frame = createFrameHandle()
  const handle: Handle = {
    id: 'test',
    props: {},
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    async update() {
      return new AbortController().signal
    },
    queueTask() {},
    frame,
    frames: {
      top: frame,
      get() {
        return undefined
      },
    },
    signal: controller.signal,
  }
  return { handle, abort: () => controller.abort() }
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

describe('createAudioRecorder', () => {
  it('starts idle and is recording after start', async () => {
    const { handle } = createTestHandle()
    const recorder = createAudioRecorder(handle)
    expect(recorder.isSupported).toBe(true)
    expect(recorder.isRecording).toBe(false)

    await recorder.start()
    expect(recorder.isRecording).toBe(true)
  })

  it('releases the mic when handle.signal aborts', async () => {
    const trackStop = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: trackStop }],
        })),
      },
    })
    const { handle, abort } = createTestHandle()
    const recorder = createAudioRecorder(handle)
    await recorder.start()
    abort()
    expect(trackStop).toHaveBeenCalled()
  })
})
