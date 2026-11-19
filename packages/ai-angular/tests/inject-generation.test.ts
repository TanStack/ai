import { Component } from '@angular/core'
import { getTestBed, TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { injectGeneration } from '../src/inject-generation'
import { injectGenerateVideo } from '../src/inject-generate-video'
import { injectGenerateImage } from '../src/inject-generate-image'
import { injectGenerateSpeech } from '../src/inject-generate-speech'
import { injectGenerate3DModel } from '../src/inject-generate-3d-model'
import type {
  Model3DResult,
  PersistedArtifactRef,
  StreamChunk,
} from '@tanstack/ai'
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

// Runs an inject* function in a component field initializer (a valid
// injection context) and exposes what it returns.
function renderInjectable<TResult>(factory: () => TResult) {
  @Component({ standalone: true, template: '' })
  class Host {
    gen = factory()
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
    const { result, flush } = renderInjectable(() =>
      injectGeneration({
        fetcher,
        threadId: 'thread-1',
      }),
    )

    expect(result.status()).toBe('idle')
    expect(result.result()).toBeNull()

    await result.generate({ prompt: 'x' })
    flush()
    expect(result.result()).toEqual({ value: 42 })
    expect(fetcher).toHaveBeenCalled()
  })

  it('throws without connection or fetcher', () => {
    expect(() =>
      renderInjectable(() => injectGeneration({ threadId: 'thread-1' })),
    ).toThrow(/connection or fetcher/i)
  })

  it('transforms the result when onResult returns a value', async () => {
    const { result, flush } = renderInjectable(() =>
      injectGeneration({
        threadId: 'thread-1',
        fetcher: async () => ({ id: '1', audio: 'base64data' }),
        onResult: (raw: { id: string; audio: string }) => ({
          playable: raw.audio.length > 0,
        }),
      }),
    )

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
    const { result } = renderInjectable(() =>
      injectGeneration({
        threadId: 'hydrate-me',
        connection: { ...adapter, hydrateGeneration },
        persistence: true,
      }),
    )

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
    const { result } = renderInjectable(() =>
      injectGenerateVideo({
        threadId: 'video-no-auto-fire',
        // No `joinRun`, so the restored run cannot be tailed.
        connection: { ...adapter, hydrateGeneration },
        persistence: true,
      }),
    )

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
    const { result } = renderInjectable(() =>
      injectGenerateImage({
        threadId: 'img-hydrate',
        connection: { ...adapter, hydrateGeneration },
        persistence: true,
      }),
    )

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
    const { result } = renderInjectable(() =>
      injectGenerateSpeech({
        threadId: 'tts-hydrate',
        connection: { ...adapter, hydrateGeneration },
        persistence: true,
      }),
    )

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

// RUN_STARTED, then the given chunks, as the 3D model server route streams them.
function create3DModelChunks(chunks: Array<StreamChunk>): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-3d',
      threadId: 'thread-3d',
      timestamp: 100,
    },
    ...chunks,
  ]
}

describe('injectGenerate3DModel', () => {
  it('reports progress, then stores the model result', async () => {
    const model: Model3DResult = {
      jobId: 'job-3d',
      url: 'https://cdn.example.com/chair.glb',
      format: 'glb',
      previewImageUrl: 'https://cdn.example.com/chair.png',
    }
    const { adapter } = createRunContextCaptureAdapter(
      create3DModelChunks([
        {
          type: EventType.CUSTOM,
          name: 'generation:progress',
          value: { progress: 40, message: 'processing' },
          timestamp: 200,
        },
        {
          type: EventType.CUSTOM,
          name: 'generation:result',
          value: model,
          timestamp: 300,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-3d',
          threadId: 'thread-3d',
          timestamp: 400,
        },
      ]),
    )
    const progressUpdates: Array<[number, string | undefined]> = []
    const { result, flush } = renderInjectable(() =>
      injectGenerate3DModel({
        threadId: 'thread-3d',
        connection: adapter,
        onProgress: (progress, message) => {
          progressUpdates.push([progress, message])
        },
      }),
    )

    await result.generate({ prompt: 'A low-poly wooden chair' })
    flush()

    expect(progressUpdates).toEqual([[40, 'processing']])
    expect(result.result()).toEqual({
      jobId: 'job-3d',
      url: 'https://cdn.example.com/chair.glb',
      format: 'glb',
      previewImageUrl: 'https://cdn.example.com/chair.png',
    })
    expect(result.status()).toBe('success')
    expect(result.error()).toBeUndefined()
  })

  it('surfaces a RUN_ERROR as the error and keeps no result', async () => {
    const { adapter } = createRunContextCaptureAdapter(
      create3DModelChunks([
        {
          type: EventType.RUN_ERROR,
          message: 'Provider job failed',
          timestamp: 200,
        },
      ]),
    )
    const onError = vi.fn()
    const { result, flush } = renderInjectable(() =>
      injectGenerate3DModel({
        threadId: 'thread-3d-error',
        connection: adapter,
        onError,
      }),
    )

    await result.generate({ prompt: 'A low-poly wooden chair' })
    flush()

    expect(result.error()?.message).toBe('Provider job failed')
    expect(result.status()).toBe('error')
    expect(result.result()).toBeNull()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Provider job failed' }),
    )
  })
})
