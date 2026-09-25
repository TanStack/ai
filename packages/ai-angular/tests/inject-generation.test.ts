import { Component } from '@angular/core'
import { getTestBed, TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { describe, expect, it, vi } from 'vitest'
import { injectGeneration } from '../src/inject-generation'
import { injectGenerateVideo } from '../src/inject-generate-video'
import { injectGenerateImage } from '../src/inject-generate-image'
import { injectGenerateSpeech } from '../src/inject-generate-speech'
import type { PersistedArtifactRef, StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '@tanstack/ai-client'

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

function renderInjectGeneration(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGeneration(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

function renderInjectGenerateVideo(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGenerateVideo(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

function renderInjectGenerateImage(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGenerateImage(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

function renderInjectGenerateSpeech(options: any) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = injectGenerateSpeech(options)
  }
  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return {
    get result() {
      return fixture.componentInstance.gen
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}

const videoResumeSnapshot = {
  schemaVersion: 1 as const,
  resumeState: { threadId: 'thread-resume', runId: 'run-resume' },
  status: 'running' as const,
}

// Hydration and snapshot removal both run through awaited promise chains, so
// drain the microtask queue rather than awaiting a single tick.
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

function createRunContextCaptureAdapter(chunks: Array<StreamChunk>): {
  adapter: ConnectConnectionAdapter
  connect: ReturnType<typeof vi.fn>
  runContexts: Array<RunAgentInputContext | undefined>
} {
  const runContexts: Array<RunAgentInputContext | undefined> = []
  const connect = vi.fn()
  const adapter: ConnectConnectionAdapter = {
    async *connect(_messages, _data, _signal, runContext) {
      connect(runContext)
      runContexts.push(runContext)
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
  return { adapter, connect, runContexts }
}

describe('injectGeneration', () => {
  it('initializes idle with a fetcher and generates a result', async () => {
    const fetcher = vi.fn(async () => ({ value: 42 }))
    const { result, flush } = renderInjectGeneration({ fetcher })

    expect(result.status()).toBe('idle')
    expect(result.result()).toBeNull()

    await result.generate({ prompt: 'x' })
    flush()
    expect(result.result()).toEqual({ value: 42 })
    expect(fetcher).toHaveBeenCalled()
  })

  it('throws without connection or fetcher', () => {
    expect(() => renderInjectGeneration({})).toThrow()
  })

  it('transforms the result when onResult returns a value', async () => {
    const { result, flush } = renderInjectGeneration({
      fetcher: async () => ({ id: '1', audio: 'base64data' }),
      onResult: (raw: { id: string; audio: string }) => ({
        playable: raw.audio.length > 0,
      }),
    })

    await result.generate({ prompt: 'x' })
    flush()
    expect(result.result()).toEqual({ playable: true })
    expect(result.status()).toBe('success')
  })
  it('hydrates a snapshot from the server on mount', async () => {
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: {
        schemaVersion: 1 as const,
        resumeState: { threadId: 'thread-stored', runId: 'run-stored' },
        status: 'running' as const,
      },
      activeRun: null,
    }))
    const { result } = renderInjectGeneration({
      threadId: 'hydrate-me',
      connection: { ...adapter, hydrateGeneration },
      persistence: true,
    })

    await flushPromises()

    expect(hydrateGeneration).toHaveBeenCalledWith('hydrate-me')
    // Hydration only surfaces state; it never restarts the run.
    expect(connect).not.toHaveBeenCalled()
    // Without a `joinRun` handler the restored run cannot be tailed, so it
    // surfaces as an interrupted error instead of a `generating` status
    // that would never settle.
    expect(result.error()?.message).toMatch(/interrupted/)
    expect(result.status()).toBe('error')
    expect(result.isLoading()).toBe(false)
    expect(result.runId()).toBeNull()
  })
})

describe('injectGenerateVideo', () => {
  it('does not auto-fire a video generation after render from a hydrated running snapshot', async () => {
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: videoResumeSnapshot,
      activeRun: null,
    }))
    const { result } = renderInjectGenerateVideo({
      threadId: 'video-no-auto-fire',
      // No `joinRun`, so the restored run cannot be tailed.
      connection: { ...adapter, hydrateGeneration },
      persistence: true,
    })

    await flushPromises()

    // Hydration only surfaces state; it never restarts the run.
    expect(connect).not.toHaveBeenCalled()
    expect(result.error()?.message).toMatch(/interrupted/)
    expect(result.status()).toBe('error')
    expect(result.isLoading()).toBe(false)
    expect(result.runId()).toBeNull()
  })
})

describe('injectGenerateImage', () => {
  it('restores a completed image result from a durable artifact url', async () => {
    // injectGenerateImage injects `reconstructImageResult`, so a restored
    // complete snapshot repaints `result` with the durable serve url — as if the
    // run had just finished.
    const artifact: PersistedArtifactRef = {
      role: 'output',
      artifactId: 'artifact-image-1',
      threadId: 'thread-img',
      runId: 'run-img',
      name: 'image.png',
      mimeType: 'image/png',
      size: 2048,
      createdAt: '2026-07-06T00:00:00.000Z',
      url: '/api/artifacts/artifact-image-1',
      source: {
        activity: 'image',
        path: 'runs/run-img/image.png',
        provider: 'test',
        model: 'test-image',
        mediaType: 'image',
      },
    }
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: {
        schemaVersion: 1 as const,
        resumeState: null,
        status: 'complete' as const,
        activity: 'image' as const,
        result: {
          id: 'img-restored',
          model: 'test-image',
          artifacts: [artifact],
        },
      },
      activeRun: null,
    }))
    const { result } = renderInjectGenerateImage({
      threadId: 'img-hydrate',
      connection: { ...adapter, hydrateGeneration },
      persistence: true,
    })

    await flushPromises()

    expect(hydrateGeneration).toHaveBeenCalledWith('img-hydrate')

    // A completed snapshot repaints the normal `status` field to `success`.
    expect(result.status()).toBe('success')
    expect(connect).not.toHaveBeenCalled()
    expect(result.result()).toEqual({
      id: 'img-restored',
      model: 'test-image',
      images: [{ url: '/api/artifacts/artifact-image-1' }],
      artifacts: [artifact],
    })
    expect(result.runId()).toBeNull()
  })
})

describe('injectGenerateSpeech', () => {
  it('restores a completed TTS result from a durable artifact url', async () => {
    // injectGenerateSpeech injects `reconstructSpeechResult`. `TTSResult.audio`
    // is a bare base64 string that persistence never stores, so the restored
    // clip is served from `artifacts[0].url` and `audio` stays empty.
    const artifact: PersistedArtifactRef = {
      role: 'output',
      artifactId: 'artifact-speech-1',
      threadId: 'thread-tts',
      runId: 'run-tts',
      name: 'speech.mp3',
      mimeType: 'audio/mpeg',
      size: 4096,
      createdAt: '2026-07-06T00:00:00.000Z',
      url: '/api/artifacts/artifact-speech-1',
      source: {
        activity: 'tts',
        path: 'runs/run-tts/speech.mp3',
        provider: 'test',
        model: 'test-tts',
        mediaType: 'audio',
      },
    }
    const { adapter, connect } = createRunContextCaptureAdapter([])
    const hydrateGeneration = vi.fn(async () => ({
      resumeSnapshot: {
        schemaVersion: 1 as const,
        resumeState: null,
        status: 'complete' as const,
        activity: 'tts' as const,
        result: {
          id: 'tts-restored',
          model: 'test-tts',
          artifacts: [artifact],
        },
      },
      activeRun: null,
    }))
    const { result } = renderInjectGenerateSpeech({
      threadId: 'tts-hydrate',
      connection: { ...adapter, hydrateGeneration },
      persistence: true,
    })

    await flushPromises()

    expect(hydrateGeneration).toHaveBeenCalledWith('tts-hydrate')
    expect(result.status()).toBe('success')
    expect(connect).not.toHaveBeenCalled()
    expect(result.result()).toEqual({
      id: 'tts-restored',
      model: 'test-tts',
      audio: '',
      format: 'mpeg',
      contentType: 'audio/mpeg',
      artifacts: [artifact],
    })
    expect(result.runId()).toBeNull()
  })
})
