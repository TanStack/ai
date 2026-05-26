import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '@tanstack/ai-event-client'
import { EventType } from '@tanstack/ai'
import { createAIDevtoolsGenerationPreview } from '../src/devtools'
import { GenerationClient } from '../src/generation-client'
import { VideoGenerationClient } from '../src/video-generation-client'
import type { StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

interface DevtoolsEvent<TPayload = unknown> {
  type: string
  payload: TPayload
  pluginId?: string
}

type DevtoolsEventCallback = (event: DevtoolsEvent) => void

const eventClientMock = vi.hoisted(() => {
  const listeners = new Map<string, Array<DevtoolsEventCallback>>()
  const unsubscribe = vi.fn()

  return {
    emit: vi.fn(),
    emitAIDevtoolsEvent: vi.fn((eventName: string, payload: unknown) => {
      eventClientMock.emit(eventName, payload)
    }),
    unsubscribe,
    on: vi.fn((eventName: string, callback: DevtoolsEventCallback) => {
      const currentListeners = listeners.get(eventName) ?? []
      currentListeners.push(callback)
      listeners.set(eventName, currentListeners)

      return () => {
        unsubscribe()
        const nextListeners = (listeners.get(eventName) ?? []).filter(
          (listener) => listener !== callback,
        )
        listeners.set(eventName, nextListeners)
      }
    }),
    dispatch(eventName: string, payload: unknown) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener({
          type: `tanstack-ai-devtools:${eventName}`,
          payload,
          pluginId: 'tanstack-ai-devtools',
        })
      }
    },
    emitted(eventName: string) {
      return eventClientMock.emit.mock.calls.filter(
        ([name]) => name === eventName,
      )
    },
    reset() {
      listeners.clear()
      unsubscribe.mockClear()
    },
  }
})

vi.mock('@tanstack/ai-event-client', () => ({
  aiEventClient: {
    emit: eventClientMock.emit,
    on: eventClientMock.on,
  },
  emitAIDevtoolsEvent: eventClientMock.emitAIDevtoolsEvent,
  createAIDevtoolsEventEnvelope: (input: {
    eventType: string
    timestamp: number
  }) => ({
    ...input,
    eventId: `event:${input.eventType}:${input.timestamp}`,
  }),
}))

describe('generation client devtools bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventClientMock.reset()
  })

  function resultChunk(value: unknown) {
    return {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value,
      timestamp: Date.now(),
    } satisfies StreamChunk
  }

  function runStartedChunk(runId: string) {
    return {
      type: EventType.RUN_STARTED,
      runId,
      threadId: 'thread-1',
      timestamp: Date.now(),
    } satisfies StreamChunk
  }

  function runFinishedChunk(runId: string) {
    return {
      type: EventType.RUN_FINISHED,
      runId,
      threadId: 'thread-1',
      timestamp: Date.now(),
      finishReason: 'stop',
    } satisfies StreamChunk
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((nextResolve) => {
      resolve = nextResolve
    })
    return { promise, resolve }
  }

  function latestSnapshotState() {
    const snapshot = eventClientMock.emitted('hook:state-snapshot').at(-1)?.[1]
    if (!isSnapshotStatePayload(snapshot)) {
      throw new Error('Expected a hook state snapshot payload')
    }
    return snapshot.state
  }

  function latestGenerationRuns() {
    const runs = latestSnapshotState().runs
    if (!Array.isArray(runs)) {
      throw new Error('Expected generation snapshot runs')
    }
    return runs
  }

  function isSnapshotStatePayload(
    value: unknown,
  ): value is { state: Record<string, unknown> } {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'state' in value &&
      value.state &&
      typeof value.state === 'object' &&
      !Array.isArray(value.state),
    )
  }

  it('normalizes generation results into renderable devtools previews', () => {
    expect(
      createAIDevtoolsGenerationPreview({
        outputKind: 'image',
        result: {
          id: 'img-1',
          model: 'image-model',
          images: [
            { url: 'https://example.com/image.png' },
            { b64Json: 'iVBORw0KGgo=' },
          ],
        },
      }),
    ).toEqual({
      kind: 'image',
      items: [
        {
          src: 'https://example.com/image.png',
          sourceType: 'url',
        },
        {
          src: 'data:image/png;base64,iVBORw0KGgo=',
          sourceType: 'base64',
          mimeType: 'image/png',
        },
      ],
    })

    expect(
      createAIDevtoolsGenerationPreview({
        outputKind: 'audio',
        result: {
          id: 'speech-1',
          model: 'tts-model',
          audio: 'UklGRg==',
          format: 'wav',
          contentType: 'audio/wav',
        },
      }),
    ).toEqual({
      kind: 'audio',
      items: [
        {
          src: 'data:audio/wav;base64,UklGRg==',
          sourceType: 'base64',
          mimeType: 'audio/wav',
          format: 'wav',
        },
      ],
    })

    expect(
      createAIDevtoolsGenerationPreview({
        outputKind: 'text',
        result: {
          id: 'transcription-1',
          model: 'whisper',
          text: 'Hello world',
        },
      }),
    ).toEqual({
      kind: 'text',
      text: 'Hello world',
    })

    expect(
      createAIDevtoolsGenerationPreview({
        outputKind: 'video',
        result: null,
        videoStatus: {
          jobId: 'job-1',
          status: 'processing',
          progress: 50,
          url: 'https://example.com/video.mp4',
        },
      }),
    ).toEqual({
      kind: 'video',
      items: [
        {
          src: 'https://example.com/video.mp4',
          sourceType: 'url',
        },
      ],
      job: {
        jobId: 'job-1',
        status: 'processing',
        progress: 50,
      },
    })
  })

  it('registers a generation hook and emits run lifecycle for fetcher mode', async () => {
    const client = new GenerationClient({
      id: 'gen-1',
      fetcher: async () => ({ text: 'done' }),
      devtools: {
        framework: 'react',
        hookName: 'useGenerateObject',
        outputKind: 'structured',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'make object' })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:started',
      expect.objectContaining({
        hookId: 'gen-1',
        source: 'client',
        visibility: 'client-state',
        runId: expect.any(String),
        status: 'started',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:completed',
      expect.objectContaining({
        hookId: 'gen-1',
        source: 'client',
        visibility: 'client-state',
        runId: expect.any(String),
        status: 'completed',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'gen-1',
        hookName: 'useGenerateObject',
        framework: 'react',
        outputKind: 'structured',
        state: expect.objectContaining({
          status: 'success',
          isLoading: false,
          result: { text: 'done' },
        }),
      }),
    )

    client.dispose()
  })

  it('includes input, progress, and renderable previews in generation snapshots', async () => {
    const client = new GenerationClient({
      id: 'image-hook',
      fetcher: async () => ({
        id: 'img-1',
        model: 'image-model',
        images: [
          { url: 'https://example.com/image.png' },
          { b64Json: 'iVBORw0KGgo=' },
        ],
      }),
      devtools: {
        framework: 'react',
        hookName: 'useGenerateImage',
        outputKind: 'image',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'A quiet desk', numberOfImages: 2 })

    expect(latestSnapshotState()).toEqual(
      expect.objectContaining({
        input: { prompt: 'A quiet desk', numberOfImages: 2 },
        progress: null,
        preview: {
          kind: 'image',
          items: [
            {
              src: 'https://example.com/image.png',
              sourceType: 'url',
            },
            {
              src: 'data:image/png;base64,iVBORw0KGgo=',
              sourceType: 'base64',
              mimeType: 'image/png',
            },
          ],
        },
      }),
    )

    client.dispose()
  })

  it('tracks streamed progress in generation snapshots', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* () {
      yield runStartedChunk('run-progress')
      yield {
        type: EventType.CUSTOM,
        name: 'generation:progress',
        value: { progress: 40, message: 'Rendering preview' },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield resultChunk({ summary: 'short version' })
      yield runFinishedChunk('run-progress')
    }

    const client = new GenerationClient({
      id: 'summary-hook',
      connection: { connect },
      devtools: {
        hookName: 'useSummarize',
        outputKind: 'text',
      },
    })
    vi.clearAllMocks()

    await client.generate({ text: 'Long text' })

    expect(latestSnapshotState()).toEqual(
      expect.objectContaining({
        input: { text: 'Long text' },
        progress: {
          value: 100,
          message: 'Rendering preview',
        },
        preview: {
          kind: 'text',
          text: 'short version',
        },
      }),
    )

    client.dispose()
  })

  it('retains grouped generation snapshots for previous runs', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* (
      _messages,
      data,
    ) {
      const prompt = typeof data?.prompt === 'string' ? data.prompt : 'unknown'
      const runId = `run-${prompt}`
      yield runStartedChunk(runId)
      yield {
        type: EventType.CUSTOM,
        name: 'generation:progress',
        value: { progress: 70, message: `Rendering ${prompt}` },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield resultChunk({
        id: `img-${prompt}`,
        model: 'image-model',
        images: [{ url: `https://example.com/${prompt}.png` }],
      })
      yield runFinishedChunk(runId)
    }

    const client = new GenerationClient({
      id: 'image-history',
      connection: { connect },
      devtools: {
        hookName: 'useGenerateImage',
        outputKind: 'image',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'one' })
    await client.generate({ prompt: 'two' })

    expect(latestGenerationRuns()).toEqual([
      expect.objectContaining({
        id: 'run-one',
        input: { prompt: 'one' },
        status: 'success',
        isLoading: false,
        progress: {
          value: 100,
          message: 'Rendering one',
        },
        result: expect.objectContaining({
          id: 'img-one',
        }),
        preview: {
          kind: 'image',
          items: [
            {
              src: 'https://example.com/one.png',
              sourceType: 'url',
            },
          ],
        },
      }),
      expect.objectContaining({
        id: 'run-two',
        input: { prompt: 'two' },
        status: 'success',
        isLoading: false,
        progress: {
          value: 100,
          message: 'Rendering two',
        },
        result: expect.objectContaining({
          id: 'img-two',
        }),
        preview: {
          kind: 'image',
          items: [
            {
              src: 'https://example.com/two.png',
              sourceType: 'url',
            },
          ],
        },
      }),
    ])

    client.dispose()
  })

  it('responds to devtools state requests for a generation hook', async () => {
    const client = new GenerationClient({
      id: 'gen-1',
      fetcher: async () => ({ text: 'done' }),
      devtools: {
        framework: 'react',
        hookName: 'useGenerateText',
        outputKind: 'text',
      },
    })
    client.mountDevtools()
    vi.clearAllMocks()

    eventClientMock.dispatch('devtools:request-state', {
      targetHookId: 'gen-1',
    })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'gen-1',
        hookName: 'useGenerateText',
        framework: 'react',
        outputKind: 'text',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'gen-1',
        state: expect.objectContaining({
          status: 'idle',
          isLoading: false,
          result: null,
          activeRunId: null,
        }),
      }),
    )

    client.dispose()
  })

  it('emits errored run lifecycle for generation failures', async () => {
    const client = new GenerationClient({
      id: 'gen-1',
      fetcher: async () => {
        throw new Error('Generation failed')
      },
      devtools: {
        hookName: 'useGenerateObject',
        outputKind: 'structured',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'fail' })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:errored',
      expect.objectContaining({
        hookId: 'gen-1',
        runId: expect.any(String),
        status: 'errored',
        error: 'Generation failed',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'gen-1',
        state: expect.objectContaining({
          status: 'error',
          isLoading: false,
          error: 'Generation failed',
        }),
      }),
    )

    client.dispose()
  })

  it('registers a generation hook for streaming connection mode', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* (
      _messages,
      _data,
      _signal,
    ) {
      yield runStartedChunk('server-run-1')
      yield resultChunk({ text: 'streamed' })
      yield runFinishedChunk('server-run-1')
    }
    const connectSpy = vi.fn(connect)

    const client = new GenerationClient({
      id: 'gen-stream',
      connection: {
        connect: connectSpy,
      },
      devtools: {
        hookName: 'useGenerateText',
        outputKind: 'text',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'stream' })
    const runContext = connectSpy.mock.calls[0]?.[3]

    expect(runContext).toEqual(
      expect.objectContaining({
        threadId: 'gen-stream',
        runId: expect.any(String),
      }),
    )

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:started',
      expect.objectContaining({
        hookId: 'gen-stream',
        runId: 'server-run-1',
      }),
    )
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'run:started',
      expect.objectContaining({
        hookId: 'gen-stream',
        runId: runContext?.runId,
      }),
    )
    expect(eventClientMock.emitted('run:started')).toHaveLength(1)
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:completed',
      expect.objectContaining({
        hookId: 'gen-stream',
        runId: 'server-run-1',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'gen-stream',
        state: expect.objectContaining({
          status: 'success',
          isLoading: false,
          result: { text: 'streamed' },
        }),
      }),
    )

    client.dispose()
  })

  it('does not emit hook updates after disposal', async () => {
    const deferred = createDeferred<{ text: string }>()
    const client = new GenerationClient({
      id: 'gen-1',
      fetcher: async () => deferred.promise,
      devtools: {
        hookName: 'useGenerateText',
        outputKind: 'text',
      },
    })
    const generatePromise = client.generate({ prompt: 'slow' })
    await Promise.resolve()

    client.dispose()
    const unregisteredIndex = eventClientMock.emit.mock.calls.findIndex(
      ([eventName]) => eventName === 'hook:unregistered',
    )
    deferred.resolve({ text: 'late' })
    await generatePromise

    expect(unregisteredIndex).toBeGreaterThanOrEqual(0)
    const emittedAfterDispose = eventClientMock.emit.mock.calls
      .slice(unregisteredIndex + 1)
      .map(([eventName]) => eventName)
    expect(emittedAfterDispose).not.toContain('hook:updated')
    expect(emittedAfterDispose).not.toContain('hook:state-snapshot')
  })

  it('uses the stream run id for video connection lifecycle events', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* (
      _messages,
      _data,
      _signal,
    ) {
      yield runStartedChunk('server-video-run-1')
      yield {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: {
          jobId: 'job-1',
          status: 'completed',
          url: 'https://example.com/video.mp4',
        },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield runFinishedChunk('server-video-run-1')
    }
    const connectSpy = vi.fn(connect)

    const client = new VideoGenerationClient({
      id: 'video-stream',
      connection: {
        connect: connectSpy,
      },
      devtools: {
        hookName: 'useGenerateVideo',
        outputKind: 'video',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'stream video' })
    const runId = connectSpy.mock.calls[0]?.[3]?.runId ?? 'missing-run'

    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'run:started',
      expect.objectContaining({
        hookId: 'video-stream',
        runId,
      }),
    )
    expect(eventClientMock.emitted('run:started')).toHaveLength(1)
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:completed',
      expect.objectContaining({
        hookId: 'video-stream',
        runId: 'server-video-run-1',
      }),
    )

    client.dispose()
  })

  it('registers a video hook and includes job state in snapshots', async () => {
    const client = new VideoGenerationClient({
      id: 'video-1',
      fetcher: async () => ({
        jobId: 'job-1',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      }),
      devtools: {
        framework: 'react',
        hookName: 'useGenerateVideo',
        outputKind: 'video',
      },
    })

    await client.generate({ prompt: 'make video' })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'video-1',
        hookName: 'useGenerateVideo',
        framework: 'react',
        outputKind: 'video',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'run:completed',
      expect.objectContaining({
        hookId: 'video-1',
        status: 'completed',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'video-1',
        state: expect.objectContaining({
          status: 'success',
          isLoading: false,
          jobId: 'job-1',
          result: expect.objectContaining({
            url: 'https://example.com/video.mp4',
          }),
        }),
      }),
    )

    client.dispose()
  })

  it('includes input, progress, and renderable previews in video snapshots', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* () {
      yield runStartedChunk('video-run')
      yield {
        type: EventType.CUSTOM,
        name: 'video:job:created',
        value: { jobId: 'job-1' },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield {
        type: EventType.CUSTOM,
        name: 'video:status',
        value: {
          jobId: 'job-1',
          status: 'processing',
          progress: 60,
          url: 'https://example.com/preview.mp4',
        },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: {
          jobId: 'job-1',
          status: 'completed',
          url: 'https://example.com/final.mp4',
        },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield runFinishedChunk('video-run')
    }

    const client = new VideoGenerationClient({
      id: 'video-hook',
      connection: { connect },
      devtools: {
        hookName: 'useGenerateVideo',
        outputKind: 'video',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'A flying car', duration: 4 })

    expect(latestSnapshotState()).toEqual(
      expect.objectContaining({
        input: { prompt: 'A flying car', duration: 4 },
        progress: {
          value: 100,
        },
        preview: {
          kind: 'video',
          items: [
            {
              src: 'https://example.com/final.mp4',
              sourceType: 'url',
            },
          ],
          job: {
            jobId: 'job-1',
            status: 'completed',
            progress: 100,
          },
        },
      }),
    )

    client.dispose()
  })

  it('retains grouped video generation snapshots for previous runs', async () => {
    const connect: ConnectConnectionAdapter['connect'] = async function* (
      _messages,
      data,
    ) {
      const prompt = typeof data?.prompt === 'string' ? data.prompt : 'unknown'
      const runId = `video-run-${prompt}`
      const jobId = `job-${prompt}`
      yield runStartedChunk(runId)
      yield {
        type: EventType.CUSTOM,
        name: 'video:job:created',
        value: { jobId },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield {
        type: EventType.CUSTOM,
        name: 'video:status',
        value: {
          jobId,
          status: 'processing',
          progress: 70,
        },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: {
          jobId,
          status: 'completed',
          url: `https://example.com/${prompt}.mp4`,
        },
        timestamp: Date.now(),
      } satisfies StreamChunk
      yield runFinishedChunk(runId)
    }

    const client = new VideoGenerationClient({
      id: 'video-history',
      connection: { connect },
      devtools: {
        hookName: 'useGenerateVideo',
        outputKind: 'video',
      },
    })
    vi.clearAllMocks()

    await client.generate({ prompt: 'one' })
    await client.generate({ prompt: 'two' })

    expect(latestGenerationRuns()).toEqual([
      expect.objectContaining({
        id: 'video-run-one',
        input: { prompt: 'one' },
        status: 'success',
        isLoading: false,
        progress: {
          value: 100,
        },
        jobId: 'job-one',
        videoStatus: expect.objectContaining({
          jobId: 'job-one',
          status: 'completed',
          progress: 100,
          url: 'https://example.com/one.mp4',
        }),
        preview: {
          kind: 'video',
          items: [
            {
              src: 'https://example.com/one.mp4',
              sourceType: 'url',
            },
          ],
          job: {
            jobId: 'job-one',
            status: 'completed',
            progress: 100,
          },
        },
      }),
      expect.objectContaining({
        id: 'video-run-two',
        input: { prompt: 'two' },
        status: 'success',
        isLoading: false,
        progress: {
          value: 100,
        },
        jobId: 'job-two',
        videoStatus: expect.objectContaining({
          jobId: 'job-two',
          status: 'completed',
          progress: 100,
          url: 'https://example.com/two.mp4',
        }),
      }),
    ])

    client.dispose()
  })
})
