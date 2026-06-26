import { Component } from '@angular/core'
import { getTestBed, TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { injectAudioRecorder } from '../src/inject-audio-recorder'
import type { InjectAudioRecorderResult } from '../src/inject-audio-recorder'
import type { AudioRecording } from '@tanstack/ai-client'

// Ensure TestBed is initialized in this module's scope, regardless of whether
// the setup file's initialization was in a different module context (possible
// when the Angular plugin creates separate ESM module instances for compiled
// and setup files in Vitest).
const testBedInstance = getTestBed() as any
if (
  testBedInstance._compiler === null ||
  testBedInstance._compiler === undefined
) {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
  )
}

// jsdom does not implement Blob.prototype.arrayBuffer — polyfill it so the
// recorder's finalize() path works under jsdom. The `Partial<Blob>` view types
// `arrayBuffer` as optional so the feature check isn't "always falsy" (lib.dom
// declares it as always present).
if (typeof Blob !== 'undefined') {
  const blobProto = Blob.prototype as Partial<Blob>
  if (typeof blobProto.arrayBuffer !== 'function') {
    blobProto.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    }
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

function renderInjectAudioRecorder(options?: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    rec = injectAudioRecorder(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result(): InjectAudioRecorderResult<AudioRecording> {
      return fixture.componentInstance
        .rec as InjectAudioRecorderResult<AudioRecording>
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

describe('injectAudioRecorder', () => {
  it('toggles isRecording and resolves a recording', async () => {
    const { result } = renderInjectAudioRecorder()
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
    const { result } = renderInjectAudioRecorder({
      onComplete: (r: any) => r.base64,
    })
    await result.start()
    const out = await result.stop()
    expect(out).toBe('AQID')
    expect(result.recording()).toBe('AQID')
  })

  it('surfaces a getUserMedia rejection through onError and rejects start()', async () => {
    const denied = new Error('Permission denied')
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(denied)) },
    })
    const onError = vi.fn()
    const { result } = renderInjectAudioRecorder({ onError })

    await expect(result.start()).rejects.toThrow('Permission denied')
    expect(onError).toHaveBeenCalledWith(denied)
    expect(result.isRecording()).toBe(false)
  })

  it('releases the mic on component destroy', async () => {
    const trackStop = vi.fn()
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })),
      },
    })
    const { result, destroy } = renderInjectAudioRecorder()
    await result.start()
    expect(result.isRecording()).toBe(true)
    // DestroyRef.onDestroy() should cancel the in-flight recording and stop the
    // microphone tracks so the mic indicator clears.
    destroy()
    expect(trackStop).toHaveBeenCalled()
  })

  it('throws outside an injection context', () => {
    expect(() => injectAudioRecorder()).toThrow()
  })
})
