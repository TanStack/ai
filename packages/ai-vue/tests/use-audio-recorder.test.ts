import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useAudioRecorder } from '../src/use-audio-recorder'
import type { AudioRecording } from '@tanstack/ai-client'

// jsdom does not implement Blob.prototype.arrayBuffer — polyfill it so the
// recorder's finalize() path works under jsdom.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

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

// Render the composable inside a component so onScopeDispose etc. are wired up.
function renderRecorder(options?: any) {
  let api: any
  const Comp = defineComponent({
    setup() {
      api = useAudioRecorder(options)
      return () => null
    },
  })
  const wrapper = mount(Comp)
  return { api: () => api, wrapper }
}

describe('useAudioRecorder (vue)', () => {
  it('toggles isRecording and resolves a recording', async () => {
    const { api } = renderRecorder()
    expect(api().isSupported).toBe(true)
    expect(api().isRecording.value).toBe(false)

    await api().start()
    expect(api().isRecording.value).toBe(true)

    const rec = await api().stop()
    expect(api().isRecording.value).toBe(false)
    expect(rec.base64).toBe('AQID')
    expect(rec.part.type).toBe('audio')
    expect(api().recording.value?.base64).toBe('AQID')
  })

  it('applies the onComplete transform to stop() and recording', async () => {
    const { api } = renderRecorder({
      onComplete: (r: AudioRecording) => r.base64,
    })
    await api().start()
    const out = await api().stop()
    expect(out).toBe('AQID')
    expect(api().recording.value).toBe('AQID')
  })
})

describe('useAudioRecorder (vue) type inference', () => {
  it('re-types stop()/recording from onComplete and falls back otherwise', () => {
    // Compile-time only: never invoked, so the recorder is never constructed.
    const _types = () => {
      const withTransform = useAudioRecorder({
        onComplete: (rec) => rec.base64,
      })
      expectTypeOf(withTransform.stop()).resolves.toBeString()
      expectTypeOf(withTransform.recording.value).toEqualTypeOf<string | null>()

      const raw = useAudioRecorder()
      expectTypeOf(raw.stop()).resolves.toEqualTypeOf<AudioRecording>()
      expectTypeOf(raw.recording.value).toEqualTypeOf<AudioRecording | null>()
    }
    expect(typeof _types).toBe('function')
  })
})
