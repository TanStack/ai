import { aiEventClient } from '@tanstack/ai-event-client'
import { EventType } from '@ag-ui/core'
import { describe, expect, it, vi } from 'vitest'
import {
  generateAudio,
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  getVideoJobStatus,
} from '../src'
import type { AudioAdapter } from '../src/activities/generateAudio'
import type { ImageAdapter } from '../src/activities/generateImage'
import type { TTSAdapter } from '../src/activities/generateSpeech'
import type { TranscriptionAdapter } from '../src/activities/generateTranscription'
import type { VideoAdapter } from '../src/activities/generateVideo'
import type {
  PersistedArtifactRef,
  StreamChunk,
  VideoStatusResult,
} from '../src/types'

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function chunkSummary(chunk: StreamChunk) {
  return {
    type: chunk.type,
    runId: 'runId' in chunk ? chunk.runId : undefined,
    threadId: 'threadId' in chunk ? chunk.threadId : undefined,
  }
}

const imageAdapterTypes: ImageAdapter<string>['~types'] = {
  providerOptions: {},
  modelProviderOptionsByName: {},
  modelSizeByName: {},
  modelInputModalitiesByName: {},
}

const audioAdapterTypes: AudioAdapter<string>['~types'] = {
  providerOptions: {},
}

const ttsAdapterTypes: TTSAdapter<string>['~types'] = {
  providerOptions: {},
}

const transcriptionAdapterTypes: TranscriptionAdapter<string>['~types'] = {
  providerOptions: {},
}

const videoAdapterTypes: VideoAdapter<string>['~types'] = {
  providerOptions: {},
  modelProviderOptionsByName: {},
  modelSizeByName: {},
  modelInputModalitiesByName: {},
  modelDurationByName: {},
}

function createMockVideoAdapter(overrides?: {
  createVideoJob?: VideoAdapter<string>['createVideoJob']
  getVideoStatus?: VideoAdapter<string>['getVideoStatus']
  getVideoUrl?: VideoAdapter<string>['getVideoUrl']
}): VideoAdapter<string> {
  return {
    kind: 'video',
    name: 'test-video',
    model: 'test-model',
    '~types': videoAdapterTypes,
    availableDurations: () => ({ kind: 'none' }),
    snapDuration: () => undefined,
    createVideoJob:
      overrides?.createVideoJob ??
      vi.fn(async () => ({
        jobId: 'job-1',
        model: 'test-model',
      })),
    getVideoStatus:
      overrides?.getVideoStatus ??
      vi.fn(
        async (): Promise<VideoStatusResult> => ({
          jobId: 'job-1',
          status: 'completed',
        }),
      ),
    getVideoUrl:
      overrides?.getVideoUrl ??
      vi.fn(async () => ({
        jobId: 'job-1',
        url: 'https://example.com/video.mp4',
      })),
  }
}

describe('generation run identity and replay', () => {
  it('passes identity through one-shot generation stream events', async () => {
    const adapter: ImageAdapter<string> = {
      kind: 'image',
      name: 'test-image',
      model: 'test-model',
      '~types': imageAdapterTypes,
      generateImages: vi.fn(async () => ({
        id: 'img-1',
        model: 'test-model',
        images: [{ url: 'https://example.com/image.png' }],
      })),
    }

    const chunks = await collect(
      generateImage({
        adapter,
        prompt: 'A mountain',
        stream: true,
        threadId: 'thread-1',
        runId: 'run-1',
      }),
    )

    expect(chunks.map(chunkSummary)).toEqual([
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 'thread-1',
      },
      {
        type: 'CUSTOM',
        runId: 'run-1',
        threadId: 'thread-1',
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
      },
    ])
  })

  it('adds identity metadata to direct generation devtools events', async () => {
    const emit = vi.spyOn(aiEventClient, 'emit').mockImplementation(() => {})
    const adapter: AudioAdapter<string> = {
      kind: 'audio',
      name: 'test-audio',
      model: 'test-model',
      '~types': audioAdapterTypes,
      generateAudio: vi.fn(async () => ({
        id: 'audio-1',
        model: 'test-model',
        audio: { url: 'https://example.com/audio.mp3' },
      })),
    }

    await generateAudio({
      adapter,
      prompt: 'drums',
      threadId: 'thread-a',
      runId: 'run-a',
    })

    expect(emit).toHaveBeenCalledWith(
      'audio:request:started',
      expect.objectContaining({
        threadId: 'thread-a',
        runId: 'run-a',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'audio:request:completed',
      expect.objectContaining({
        threadId: 'thread-a',
        runId: 'run-a',
      }),
    )
  })

  it('passes identity through speech, transcription, and video streams', async () => {
    const speech = await collect(
      generateSpeech({
        adapter: {
          kind: 'tts',
          name: 'test-tts',
          model: 'test-model',
          '~types': ttsAdapterTypes,
          generateSpeech: vi.fn(async () => ({
            id: 'speech-1',
            model: 'test-model',
            audio: 'base64',
            format: 'mp3',
          })),
        },
        text: 'hello',
        stream: true,
        threadId: 'thread-s',
        runId: 'run-s',
      }),
    )

    const transcription = await collect(
      generateTranscription({
        adapter: {
          kind: 'transcription',
          name: 'test-transcription',
          model: 'test-model',
          '~types': transcriptionAdapterTypes,
          transcribe: vi.fn(async () => ({
            id: 'tx-1',
            model: 'test-model',
            text: 'hello',
          })),
        },
        audio: 'base64',
        stream: true,
        threadId: 'thread-t',
        runId: 'run-t',
      }),
    )

    const videoAdapter = createMockVideoAdapter()

    const video = await collect(
      generateVideo({
        adapter: videoAdapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 0,
        threadId: 'thread-v',
        runId: 'run-v',
      }),
    )

    expect(speech.map(chunkSummary)).toContainEqual({
      type: 'CUSTOM',
      runId: 'run-s',
      threadId: 'thread-s',
    })
    expect(transcription.map(chunkSummary)).toContainEqual({
      type: 'CUSTOM',
      runId: 'run-t',
      threadId: 'thread-t',
    })
    expect(video.map(chunkSummary)).toContainEqual({
      type: 'RUN_FINISHED',
      runId: 'run-v',
      threadId: 'thread-v',
    })
  })

  it('replays persisted generation events without calling the adapter', async () => {
    const adapter: ImageAdapter<string> = {
      kind: 'image',
      name: 'test-image',
      model: 'test-model',
      '~types': imageAdapterTypes,
      generateImages: vi.fn(async () => {
        throw new Error('provider should not be called')
      }),
    }
    const replayEvents = [
      {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: {
          id: 'persisted-image',
          model: 'test-model',
          images: [{ url: 'https://example.com/persisted.png' }],
        },
        runId: 'run-replay',
        threadId: 'thread-replay',
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-replay',
        threadId: 'thread-replay',
        finishReason: 'stop',
      },
    ] satisfies Array<StreamChunk>

    const chunks = await collect(
      generateImage({
        adapter,
        prompt: 'ignored',
        stream: true,
        replay: { events: replayEvents },
      }),
    )

    expect(adapter.generateImages).not.toHaveBeenCalled()
    expect(chunks).toEqual(replayEvents)
  })

  it('emits a RUN_ERROR terminal when replaying events throws mid-iteration', async () => {
    const adapter: ImageAdapter<string> = {
      kind: 'image',
      name: 'test-image',
      model: 'test-model',
      '~types': imageAdapterTypes,
      generateImages: vi.fn(async () => {
        throw new Error('provider should not be called')
      }),
    }
    const firstEvent: StreamChunk = {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: { id: 'persisted-image', model: 'test-model', images: [] },
      runId: 'run-throw',
      threadId: 'thread-throw',
    }
    async function* throwingEvents(): AsyncIterable<StreamChunk> {
      yield firstEvent
      // Simulate a persistence store failing partway through the log read.
      throw new Error('store exploded')
    }

    const chunks = await collect(
      generateImage({
        adapter,
        prompt: 'ignored',
        stream: true,
        replay: { events: throwingEvents() },
      }),
    )

    expect(adapter.generateImages).not.toHaveBeenCalled()
    // The already-yielded event is preserved, then a RUN_ERROR terminal is
    // synthesized instead of the raw error escaping the stream.
    expect(chunks[0]).toEqual(firstEvent)
    const terminal = chunks[chunks.length - 1]!
    expect(terminal.type).toBe(EventType.RUN_ERROR)
    expect((terminal as { message?: string }).message).toContain(
      'store exploded',
    )
    // Identity is carried from the last replayed event so consumers correlate.
    expect((terminal as { runId?: string }).runId).toBe('run-throw')
    expect((terminal as { threadId?: string }).threadId).toBe('thread-throw')
  })

  it('synthesizes a RUN_ERROR terminal when a replayed log ends before a terminal event', async () => {
    const adapter: ImageAdapter<string> = {
      kind: 'image',
      name: 'test-image',
      model: 'test-model',
      '~types': imageAdapterTypes,
      generateImages: vi.fn(async () => {
        throw new Error('provider should not be called')
      }),
    }
    // A run interrupted mid-persist leaves a log with no RUN_FINISHED/RUN_ERROR.
    const truncatedEvents = [
      {
        type: EventType.RUN_STARTED,
        runId: 'run-trunc',
        threadId: 'thread-trunc',
      },
      {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: { id: 'persisted-image', model: 'test-model', images: [] },
        runId: 'run-trunc',
        threadId: 'thread-trunc',
      },
    ] satisfies Array<StreamChunk>

    const chunks = await collect(
      generateImage({
        adapter,
        prompt: 'ignored',
        stream: true,
        replay: { events: truncatedEvents },
      }),
    )

    expect(adapter.generateImages).not.toHaveBeenCalled()
    // Persisted events are re-emitted verbatim...
    expect(chunks.slice(0, truncatedEvents.length)).toEqual(truncatedEvents)
    // ...then a synthesized RUN_ERROR terminal completes the stream so the
    // StreamProcessor doesn't hang waiting for a terminal that never persisted.
    expect(chunks).toHaveLength(truncatedEvents.length + 1)
    const terminal = chunks[chunks.length - 1]!
    expect(terminal.type).toBe(EventType.RUN_ERROR)
    expect((terminal as { message?: string }).message).toMatch(
      /ended before a terminal/i,
    )
    expect((terminal as { runId?: string }).runId).toBe('run-trunc')
    expect((terminal as { threadId?: string }).threadId).toBe('thread-trunc')
  })

  it('returns a replayed final result without running transforms or the adapter', async () => {
    const adapter: AudioAdapter<string> = {
      kind: 'audio',
      name: 'test-audio',
      model: 'test-model',
      '~types': audioAdapterTypes,
      generateAudio: vi.fn(async () => {
        throw new Error('provider should not be called')
      }),
    }
    const transform = vi.fn((result) => result)
    const persisted = {
      id: 'audio-replay',
      model: 'test-model',
      audio: { url: 'https://example.com/replayed.mp3' },
    }

    const result = await generateAudio({
      adapter,
      prompt: 'ignored',
      replay: { result: persisted },
      middleware: [
        {
          onStart: (ctx) => {
            ctx.resultTransforms?.push(transform)
          },
        },
      ],
    })

    expect(adapter.generateAudio).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
    expect(result).toBe(persisted)
  })

  it('emits replayed video artifacts before the replayed streaming result without running middleware or the adapter', async () => {
    const artifact: PersistedArtifactRef = {
      role: 'output',
      artifactId: 'artifact-replay',
      threadId: 'thread-video-replay',
      runId: 'run-video-replay',
      name: 'video.mp4',
      mimeType: 'video/mp4',
      size: 12,
      createdAt: '2026-07-06T00:00:00.000Z',
      source: {
        activity: 'video',
        path: 'video',
        provider: 'test-video',
        model: 'test-model',
        mediaType: 'video',
        jobId: 'job-replay',
      },
    }
    const createVideoJob = vi.fn(async () => {
      throw new Error('video provider should not be called')
    })
    const onStart = vi.fn(() => {
      throw new Error('middleware should not run for replay')
    })

    const chunks = await collect(
      generateVideo({
        adapter: createMockVideoAdapter({ createVideoJob }),
        prompt: 'ignored',
        stream: true,
        threadId: 'thread-video-replay',
        runId: 'run-video-replay',
        replay: {
          result: {
            jobId: 'job-replay',
            url: 'https://example.com/replayed.mp4',
            artifacts: [artifact],
          },
        },
        middleware: [{ onStart }],
      }),
    )

    const customEvents = chunks.filter(
      (chunk) => chunk.type === EventType.CUSTOM,
    )
    expect(customEvents.map((chunk) => chunk.name)).toEqual([
      'generation:artifacts',
      'generation:result',
    ])
    expect(customEvents[0]?.value).toEqual([artifact])
    expect(
      (customEvents[1]?.value as { artifacts?: unknown }).artifacts,
    ).toEqual([artifact])
    expect(createVideoJob).not.toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('rejects non-stream events-only replay without calling providers', async () => {
    const replayEvents = [
      {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: { id: 'persisted', model: 'test-model' },
        runId: 'run-replay',
        threadId: 'thread-replay',
      },
    ] satisfies Array<StreamChunk>
    const expectedMessage =
      'Generation replay with events requires stream: true or a replay.result.'

    const imageGenerate = vi.fn(async () => {
      throw new Error('image provider should not be called')
    })
    await expect(
      generateImage({
        adapter: {
          kind: 'image',
          name: 'test-image',
          model: 'test-model',
          '~types': imageAdapterTypes,
          generateImages: imageGenerate,
        },
        prompt: 'ignored',
        replay: { events: replayEvents },
      }),
    ).rejects.toThrow(expectedMessage)
    expect(imageGenerate).not.toHaveBeenCalled()

    const audioGenerate = vi.fn(async () => {
      throw new Error('audio provider should not be called')
    })
    await expect(
      generateAudio({
        adapter: {
          kind: 'audio',
          name: 'test-audio',
          model: 'test-model',
          '~types': audioAdapterTypes,
          generateAudio: audioGenerate,
        },
        prompt: 'ignored',
        replay: { events: replayEvents },
      }),
    ).rejects.toThrow(expectedMessage)
    expect(audioGenerate).not.toHaveBeenCalled()

    const speechGenerate = vi.fn(async () => {
      throw new Error('speech provider should not be called')
    })
    await expect(
      generateSpeech({
        adapter: {
          kind: 'tts',
          name: 'test-tts',
          model: 'test-model',
          '~types': ttsAdapterTypes,
          generateSpeech: speechGenerate,
        },
        text: 'ignored',
        replay: { events: replayEvents },
      }),
    ).rejects.toThrow(expectedMessage)
    expect(speechGenerate).not.toHaveBeenCalled()

    const transcribe = vi.fn(async () => {
      throw new Error('transcription provider should not be called')
    })
    await expect(
      generateTranscription({
        adapter: {
          kind: 'transcription',
          name: 'test-transcription',
          model: 'test-model',
          '~types': transcriptionAdapterTypes,
          transcribe,
        },
        audio: 'ignored',
        replay: { events: replayEvents },
      }),
    ).rejects.toThrow(expectedMessage)
    expect(transcribe).not.toHaveBeenCalled()

    const createVideoJob = vi.fn(async () => {
      throw new Error('video provider should not be called')
    })
    await expect(
      generateVideo({
        adapter: createMockVideoAdapter({ createVideoJob }),
        prompt: 'ignored',
        replay: { events: replayEvents },
      }),
    ).rejects.toThrow(expectedMessage)
    expect(createVideoJob).not.toHaveBeenCalled()
  })

  it('adds identity to video status devtools events', async () => {
    const emit = vi.spyOn(aiEventClient, 'emit').mockImplementation(() => {})
    const adapter = createMockVideoAdapter({
      createVideoJob: vi.fn(),
      getVideoStatus: vi.fn(
        async (): Promise<VideoStatusResult> => ({
          jobId: 'job-status',
          status: 'completed',
          progress: 100,
        }),
      ),
      getVideoUrl: vi.fn(async () => ({
        jobId: 'job-status',
        url: 'https://example.com/status-video.mp4',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          unitsBilled: 1,
        },
      })),
    })

    await getVideoJobStatus({
      adapter,
      jobId: 'job-status',
      threadId: 'thread-status',
      runId: 'run-status',
    })

    expect(emit).toHaveBeenCalledWith(
      'video:request:started',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'video:request:completed',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'video:usage',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
      }),
    )
  })
})
