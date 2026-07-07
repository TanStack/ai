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
    cursor: chunk.cursor,
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
  it('passes identity and advancing cursors through one-shot generation stream events', async () => {
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
        cursor: 'cursor-0',
      }),
    )

    expect(chunks.map(chunkSummary)).toEqual([
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 'thread-1',
        cursor: 'cursor-0:1',
      },
      {
        type: 'CUSTOM',
        runId: 'run-1',
        threadId: 'thread-1',
        cursor: 'cursor-0:2',
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        cursor: 'cursor-0:3',
      },
    ])
  })

  it('adds identity and cursor metadata to direct generation devtools events', async () => {
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
      cursor: 'cursor-a',
    })

    expect(emit).toHaveBeenCalledWith(
      'audio:request:started',
      expect.objectContaining({
        threadId: 'thread-a',
        runId: 'run-a',
        cursor: 'cursor-a:1',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'audio:request:completed',
      expect.objectContaining({
        threadId: 'thread-a',
        runId: 'run-a',
        cursor: 'cursor-a:2',
      }),
    )
  })

  it('passes identity and cursors through speech, transcription, and video streams', async () => {
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
        cursor: 'cursor-s',
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
        cursor: 'cursor-t',
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
        cursor: 'cursor-v',
      }),
    )

    expect(speech.map((chunk) => chunk.cursor)).toEqual([
      'cursor-s:1',
      'cursor-s:2',
      'cursor-s:3',
    ])
    expect(speech.map(chunkSummary)).toContainEqual({
      type: 'CUSTOM',
      runId: 'run-s',
      threadId: 'thread-s',
      cursor: 'cursor-s:2',
    })
    expect(transcription.map(chunkSummary)).toContainEqual({
      type: 'CUSTOM',
      runId: 'run-t',
      threadId: 'thread-t',
      cursor: 'cursor-t:2',
    })
    expect(video.map(chunkSummary)).toContainEqual({
      type: 'RUN_FINISHED',
      runId: 'run-v',
      threadId: 'thread-v',
      cursor: 'cursor-v:5',
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
        cursor: 'cursor-replay:2',
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-replay',
        threadId: 'thread-replay',
        finishReason: 'stop',
        cursor: 'cursor-replay:3',
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

    const customEvents = chunks.filter((chunk) => chunk.type === EventType.CUSTOM)
    expect(customEvents.map((chunk) => chunk.name)).toEqual([
      'generation:artifacts',
      'generation:result',
    ])
    expect(customEvents[0]?.value).toEqual([artifact])
    expect((customEvents[1]?.value as { artifacts?: unknown }).artifacts).toEqual([
      artifact,
    ])
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
        cursor: 'cursor-replay:2',
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

  it('adds identity and advancing cursors to video status devtools events', async () => {
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
      cursor: 'cursor-status',
    })

    expect(emit).toHaveBeenCalledWith(
      'video:request:started',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
        cursor: 'cursor-status:1',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'video:request:completed',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
        cursor: 'cursor-status:2',
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'video:usage',
      expect.objectContaining({
        threadId: 'thread-status',
        runId: 'run-status',
        cursor: 'cursor-status:3',
      }),
    )
  })
})
