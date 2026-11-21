import { aiEventClient } from '@tanstack/ai-event-client'
import { describe, it, expect, vi } from 'vitest'
import {
  generateImage,
  generateVideo,
  generateSpeech,
  generateTranscription,
} from '../src/index'
import { tanstackMetadata } from '../src/utilities/merge-metadata'
import { rebuildTokenUsage } from '../src/utilities/ag-ui-usage'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { StreamChunk, VideoStatusResult } from '../src/types'

// Helper to collect all chunks from an async iterable
async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

// ============================================================================
// generateImage({ stream: true }) tests
// ============================================================================

describe('generateImage({ stream: true })', () => {
  function createMockImageAdapter(
    overrides?: Partial<{
      generateImages: (...args: Array<any>) => Promise<any>
    }>,
  ) {
    return {
      kind: 'image' as const,
      name: 'test-image',
      model: 'test-model',
      '~types': {} as any,
      generateImages:
        overrides?.generateImages ??
        vi.fn(async () => ({
          id: 'img-1',
          model: 'test-model',
          images: [{ url: 'https://example.com/image.png' }],
        })),
    }
  }

  it('should emit RUN_STARTED, CUSTOM result, and RUN_FINISHED', async () => {
    const adapter = createMockImageAdapter()

    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter,
        prompt: 'A beautiful sunset',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(3)

    expect(chunks[0]!.type).toBe('RUN_STARTED')
    expect(chunks[0]!).toHaveProperty('runId')

    expect(chunks[1]!.type).toBe('CUSTOM')
    if (chunks[1]!.type === 'CUSTOM') {
      expect(chunks[1]!.name).toBe('generation:result')
      expect(chunks[1]!.value).toEqual({
        id: 'img-1',
        model: 'test-model',
        images: [{ url: 'https://example.com/image.png' }],
      })
    }

    expect(chunks[2]!.type).toBe('RUN_FINISHED')
    if (chunks[2]!.type === 'RUN_FINISHED') {
      expect(chunks[2]!).not.toHaveProperty('finishReason')
      expect(tanstackMetadata(chunks[2]!)?.finishReason).toBe('stop')
    }
  })

  it('should emit RUN_ERROR when adapter throws', async () => {
    const adapter = createMockImageAdapter({
      generateImages: vi.fn(async () => {
        throw new Error('Image generation failed')
      }),
    })

    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter,
        prompt: 'A beautiful sunset',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.message).toBe('Image generation failed')
    }
  })

  it('should include the image generation result in the CUSTOM event value', async () => {
    const mockResult = {
      id: 'img-42',
      model: 'test-model',
      images: [
        { url: 'https://example.com/a.png' },
        { url: 'https://example.com/b.png' },
      ],
    }
    const adapter = createMockImageAdapter({
      generateImages: vi.fn(async () => mockResult),
    })

    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter,
        prompt: 'Multiple images',
        stream: true,
      }),
    )

    const resultChunk = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'generation:result',
    )
    expect(resultChunk).toBeDefined()
    if (resultChunk?.type === 'CUSTOM') {
      expect(resultChunk.value).toEqual(mockResult)
    }
  })

  it('should include timestamps on all events', async () => {
    const adapter = createMockImageAdapter()
    const before = Date.now()

    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter,
        prompt: 'Timestamp test',
        stream: true,
      }),
    )

    const after = Date.now()

    for (const chunk of chunks) {
      expect(chunk.timestamp).toBeGreaterThanOrEqual(before)
      expect(chunk.timestamp).toBeLessThanOrEqual(after)
    }
  })
})

// ============================================================================
// generateVideo({ stream: true }) tests
// ============================================================================

describe('generateVideo({ stream: true })', () => {
  function createMockVideoAdapter(options?: {
    pollsBeforeComplete?: number
    failOnPoll?: number
  }) {
    const pollsBeforeComplete = options?.pollsBeforeComplete ?? 2
    const failOnPoll = options?.failOnPoll
    let pollCount = 0

    return {
      kind: 'video' as const,
      name: 'test-video',
      model: 'test-model',
      '~types': {} as any,

      availableDurations: () => ({ kind: 'none' as const }),
      snapDuration: () => undefined,

      createVideoJob: vi.fn(async () => ({
        jobId: 'job-123',
        model: 'test-model',
      })),

      getVideoStatus: vi.fn(async (): Promise<VideoStatusResult> => {
        pollCount++
        if (failOnPoll && pollCount >= failOnPoll) {
          return {
            jobId: 'job-123',
            status: 'failed',
            error: 'Video processing error',
          }
        }
        if (pollCount >= pollsBeforeComplete) {
          return {
            jobId: 'job-123',
            status: 'completed',
            progress: 100,
          }
        }
        return {
          jobId: 'job-123',
          status: 'processing',
          progress: Math.round((pollCount / pollsBeforeComplete) * 100),
        }
      }),

      getVideo: vi.fn(async () => ({
        jobId: 'job-123',
        url: 'https://example.com/video.mp4',
        expiresAt: new Date('2030-01-01'),
      })),
    }
  }

  it('should emit job lifecycle events until completion', async () => {
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 2 })

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    // RUN_STARTED, video:job:created, video:status (processing), video:status (completed), generation:result, RUN_FINISHED
    const types = chunks.map((c) =>
      c.type === 'CUSTOM' ? `CUSTOM:${c.name}` : c.type,
    )

    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('CUSTOM:video:job:created')
    expect(types).toContain('CUSTOM:video:status')
    expect(types).toContain('CUSTOM:generation:result')
    expect(types).toContain('RUN_FINISHED')

    // Check job created event
    const jobCreated = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'video:job:created',
    )
    if (jobCreated?.type === 'CUSTOM') {
      expect(jobCreated.value).toEqual({ jobId: 'job-123' })
    }

    // Check result
    const result = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'generation:result',
    )
    if (result?.type === 'CUSTOM') {
      const value = result.value as any
      expect(value.url).toBe('https://example.com/video.mp4')
      expect(value.jobId).toBe('job-123')
      expect(value.status).toBe('completed')
    }
  })

  it('should emit RUN_ERROR when video generation fails', async () => {
    const adapter = createMockVideoAdapter({ failOnPoll: 1 })

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const types = chunks.map((c) => c.type)
    expect(types).toContain('RUN_ERROR')

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Video processing error')
    }
  })

  it('should pass input parameters to createVideoJob', async () => {
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 1 })

    await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'A flying car',
        size: '1280x720',
        duration: 5,
        stream: true,
        pollingInterval: 10,
      }),
    )

    expect(adapter.createVideoJob).toHaveBeenCalledWith({
      model: 'test-model',
      prompt: 'A flying car',
      size: '1280x720',
      duration: 5,
      modelOptions: undefined,
      logger: expect.any(Object),
    })
  })

  it('should timeout after maxDuration', async () => {
    // Adapter that never completes
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 999999 })

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
        maxDuration: 50,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Video generation timed out')
    }
  })

  it('should emit RUN_ERROR when createVideoJob throws', async () => {
    const adapter = createMockVideoAdapter()
    adapter.createVideoJob = vi.fn(async () => {
      throw new Error('Job creation failed')
    })

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const types = chunks.map((c) =>
      c.type === 'CUSTOM' ? `CUSTOM:${c.name}` : c.type,
    )
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('RUN_ERROR')
    expect(types).not.toContain('CUSTOM:video:job:created')

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Job creation failed')
    }
  })

  it('should emit RUN_ERROR when getVideo throws after completed status', async () => {
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 1 })
    adapter.getVideo = vi.fn(async () => {
      throw new Error('Failed to retrieve video URL')
    })

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Failed to retrieve video URL')
    }
  })

  it('should propagate error message from failed status', async () => {
    const adapter = createMockVideoAdapter()
    adapter.getVideoStatus = vi.fn(async () => ({
      jobId: 'job-123',
      status: 'failed' as const,
      error: 'Content policy violation',
    }))

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Content policy violation')
    }
  })

  it('should use default message when failed status has no error', async () => {
    const adapter = createMockVideoAdapter()
    adapter.getVideoStatus = vi.fn(async () => ({
      jobId: 'job-123',
      status: 'failed' as const,
    }))

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.message).toBe('Video generation failed')
    }
  })
})

// ============================================================================
// generateSpeech({ stream: true }) tests
// ============================================================================

describe('generateSpeech({ stream: true })', () => {
  function createMockTTSAdapter(
    overrides?: Partial<{
      generateSpeech: (...args: Array<any>) => Promise<any>
    }>,
  ) {
    return {
      kind: 'tts' as const,
      name: 'test-tts',
      model: 'test-model',
      '~types': {} as any,
      generateSpeech:
        overrides?.generateSpeech ??
        vi.fn(async () => ({
          id: 'speech-1',
          model: 'test-model',
          audio: 'base64-audio-data',
          format: 'mp3',
          duration: 2.5,
          contentType: 'audio/mp3',
        })),
    }
  }

  it('should emit RUN_STARTED, CUSTOM result, and RUN_FINISHED', async () => {
    const adapter = createMockTTSAdapter()

    const chunks = await collectChunks(
      generateSpeech({
        threadId: 'thread-1',
        adapter,
        text: 'Hello world',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(3)

    expect(chunks[0]!.type).toBe('RUN_STARTED')
    expect(chunks[0]!).toHaveProperty('runId')

    expect(chunks[1]!.type).toBe('CUSTOM')
    if (chunks[1]!.type === 'CUSTOM') {
      expect(chunks[1]!.name).toBe('generation:result')
      expect(chunks[1]!.value).toEqual({
        id: 'speech-1',
        model: 'test-model',
        audio: 'base64-audio-data',
        format: 'mp3',
        duration: 2.5,
        contentType: 'audio/mp3',
      })
    }

    expect(chunks[2]!.type).toBe('RUN_FINISHED')
    if (chunks[2]!.type === 'RUN_FINISHED') {
      expect(chunks[2]!).not.toHaveProperty('finishReason')
      expect(tanstackMetadata(chunks[2]!)?.finishReason).toBe('stop')
    }
  })

  it('should emit RUN_ERROR when adapter throws', async () => {
    const adapter = createMockTTSAdapter({
      generateSpeech: vi.fn(async () => {
        throw new Error('Speech generation failed')
      }),
    })

    const chunks = await collectChunks(
      generateSpeech({
        threadId: 'thread-1',
        adapter,
        text: 'Hello world',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.message).toBe('Speech generation failed')
    }
  })
})

// ============================================================================
// generateTranscription({ stream: true }) tests
// ============================================================================

describe('generateTranscription({ stream: true })', () => {
  function createMockTranscriptionAdapter(
    overrides?: Partial<{
      transcribe: (...args: Array<any>) => Promise<any>
      transcribeStream: (...args: Array<any>) => AsyncGenerator<string, any>
    }>,
  ) {
    return {
      kind: 'transcription' as const,
      name: 'test-transcription',
      model: 'test-model',
      '~types': {} as any,
      transcribe:
        overrides?.transcribe ??
        vi.fn(async () => ({
          id: 'txn-1',
          model: 'test-model',
          text: 'Hello, this is a transcription.',
          language: 'en',
          duration: 5.0,
        })),
      transcribeStream: overrides?.transcribeStream,
    }
  }

  it('emits standard text deltas and the complete transcription result', async () => {
    let abortSignal: AbortSignal | undefined
    const callerAbort = new AbortController()
    const addAbortListener = vi.spyOn(callerAbort.signal, 'addEventListener')
    const removeAbortListener = vi.spyOn(
      callerAbort.signal,
      'removeEventListener',
    )
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(async function* (options) {
        abortSignal = options.abortSignal
        yield 'Hello '
        yield 'world.'
        return {
          id: 'txn-2',
          model: 'test-model',
          text: 'Hello world.',
          language: 'en',
        }
      }),
    })

    const chunks = await collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        abortSignal: callerAbort.signal,
        stream: true,
      }),
    )

    expect(
      chunks.map((chunk) =>
        chunk.type === 'CUSTOM' ? `CUSTOM:${chunk.name}` : chunk.type,
      ),
    ).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'CUSTOM:generation:result',
      'RUN_FINISHED',
    ])
    expect(
      chunks
        .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
        .map((chunk) =>
          chunk.type === 'TEXT_MESSAGE_CONTENT' ? chunk.delta : '',
        ),
    ).toEqual(['Hello ', 'world.'])

    const result = chunks.find(
      (chunk) => chunk.type === 'CUSTOM' && chunk.name === 'generation:result',
    )
    expect(result).toMatchObject({
      value: {
        id: 'txn-2',
        model: 'test-model',
        text: 'Hello world.',
        language: 'en',
      },
    })
    expect(abortSignal?.aborted).toBe(false)
    const listener = addAbortListener.mock.calls.find(
      ([type]) => type === 'abort',
    )?.[1]
    expect(listener).toBeDefined()
    expect(removeAbortListener).toHaveBeenCalledWith('abort', listener)
  })

  it('emits only transformed text when result transforms are registered', async () => {
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(async function* () {
        yield 'private '
        yield 'transcript'
        return {
          id: 'txn-redacted',
          model: 'test-model',
          text: 'private transcript',
        }
      }),
    })
    const middleware: Array<GenerationMiddleware> = [
      {
        onStart: (ctx) => {
          ctx.resultTransforms.push((result) => ({
            ...result,
            text: '[redacted]',
          }))
        },
      },
    ]

    const chunks = await collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        middleware,
        stream: true,
      }),
    )

    expect(
      chunks
        .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
        .map((chunk) =>
          chunk.type === 'TEXT_MESSAGE_CONTENT' ? chunk.delta : '',
        ),
    ).toEqual(['[redacted]'])
    expect(JSON.stringify(chunks)).not.toContain('private transcript')
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'CUSTOM',
        name: 'generation:result',
        value: expect.objectContaining({ text: '[redacted]' }),
      }),
    )
  })

  it('withholds streamed text while middleware can register result transforms', async () => {
    let releaseProvider!: () => void
    let signalProviderWaiting!: () => void
    let registerRedactor!: () => void
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve
    })
    const providerWaiting = new Promise<void>((resolve) => {
      signalProviderWaiting = resolve
    })
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(async function* () {
        signalProviderWaiting()
        await providerGate
        yield 'private transcript'
        return {
          id: 'txn-late-redaction',
          model: 'test-model',
          text: 'private transcript',
        }
      }),
    })

    const chunksPromise = collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        middleware: [
          {
            onStart: (ctx) => {
              registerRedactor = () => {
                ctx.resultTransforms.push((result) => ({
                  ...result,
                  text: '[redacted]',
                }))
              }
            },
          },
        ],
        stream: true,
      }),
    )

    await providerWaiting
    registerRedactor()
    releaseProvider()
    const chunks = await chunksPromise

    expect(
      chunks
        .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
        .map((chunk) =>
          chunk.type === 'TEXT_MESSAGE_CONTENT' ? chunk.delta : '',
        ),
    ).toEqual(['[redacted]'])
    expect(JSON.stringify(chunks)).not.toContain('private transcript')
  })

  it('cancels while result transforms are pending', async () => {
    const callerAbort = new AbortController()
    let releaseTransform!: () => void
    let signalTransformStarted!: () => void
    let transformSignal: AbortSignal | undefined
    const transformGate = new Promise<void>((resolve) => {
      releaseTransform = resolve
    })
    const transformStarted = new Promise<void>((resolve) => {
      signalTransformStarted = resolve
    })
    const adapter = createMockTranscriptionAdapter()

    const resultPromise = generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'base64-audio-data',
      abortSignal: callerAbort.signal,
      timeout: 10_000,
      middleware: [
        {
          onStart: (ctx) => {
            ctx.resultTransforms.push(async (result, transformCtx) => {
              transformSignal = transformCtx.middleware.signal
              signalTransformStarted()
              await transformGate
              return result
            })
          },
        },
      ],
    })

    await transformStarted
    callerAbort.abort(new Error('Caller stopped'))
    const signalAbortedDuringTransform = transformSignal?.aborted
    let timeout: ReturnType<typeof setTimeout> | undefined
    const rejectedBeforeRelease = await Promise.race([
      resultPromise.then(
        () => false,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 1_000)
      }),
    ])
    if (timeout !== undefined) clearTimeout(timeout)
    releaseTransform()
    const resultState = await resultPromise.then(
      () => 'resolved',
      () => 'rejected',
    )

    expect(signalAbortedDuringTransform).toBe(true)
    expect(rejectedBeforeRelease).toBe(true)
    expect(resultState).toBe('rejected')
  })

  it('does not invoke the adapter if onStart returns after cancellation', async () => {
    let releaseOnStart!: () => void
    let signalOnStart!: () => void
    const onStartEntered = new Promise<void>((resolve) => {
      signalOnStart = resolve
    })
    const onStartGate = new Promise<void>((resolve) => {
      releaseOnStart = resolve
    })
    const adapter = createMockTranscriptionAdapter({
      transcribe: vi.fn(),
      transcribeStream: vi.fn(async function* () {
        return {
          id: 'txn-cancelled',
          model: 'test-model',
          text: '',
        }
      }),
    })
    const iterator = generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'base64-audio-data',
      middleware: [
        {
          onStart: async () => {
            signalOnStart()
            await onStartGate
          },
        },
      ],
      stream: true,
    })[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.next()
    await onStartEntered

    const pendingText = iterator.next()
    const cancellation = iterator.return?.()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const settledBeforeOnStart = await Promise.race([
      Promise.all([pendingText, cancellation]).then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 1_000)
      }),
    ])
    if (timeout !== undefined) clearTimeout(timeout)
    releaseOnStart()
    const [pendingChunk, cancellationResult] = await Promise.all([
      pendingText,
      cancellation,
    ])

    expect(settledBeforeOnStart).toBe(true)
    expect(pendingChunk.value).toMatchObject({ type: 'RUN_ERROR' })
    expect(cancellationResult).toMatchObject({ done: true })
    expect(adapter.transcribeStream).not.toHaveBeenCalled()
    expect(adapter.transcribe).not.toHaveBeenCalled()
  })

  it('should emit RUN_STARTED, CUSTOM result, and RUN_FINISHED', async () => {
    const adapter = createMockTranscriptionAdapter()

    const chunks = await collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(3)

    expect(chunks[0]!.type).toBe('RUN_STARTED')
    expect(chunks[0]!).toHaveProperty('runId')

    expect(chunks[1]!.type).toBe('CUSTOM')
    if (chunks[1]!.type === 'CUSTOM') {
      expect(chunks[1]!.name).toBe('generation:result')
      expect(chunks[1]!.value).toEqual({
        id: 'txn-1',
        model: 'test-model',
        text: 'Hello, this is a transcription.',
        language: 'en',
        duration: 5.0,
      })
    }

    expect(chunks[2]!.type).toBe('RUN_FINISHED')
    if (chunks[2]!.type === 'RUN_FINISHED') {
      expect(chunks[2]!).not.toHaveProperty('finishReason')
      expect(tanstackMetadata(chunks[2]!)?.finishReason).toBe('stop')
    }
  })

  it('should emit RUN_ERROR when adapter throws', async () => {
    const adapter = createMockTranscriptionAdapter({
      transcribe: vi.fn(async () => {
        throw new Error('Transcription failed')
      }),
    })

    const chunks = await collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.message).toBe('Transcription failed')
    }
  })

  it('emits RUN_ERROR when a streaming adapter fails after a delta', async () => {
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(async function* () {
        yield 'Partial text'
        throw new Error('Transcription stream failed')
      }),
    })

    const chunks = await collectChunks(
      generateTranscription({
        threadId: 'thread-1',
        adapter,
        audio: 'base64-audio-data',
        stream: true,
      }),
    )

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'RUN_ERROR',
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'Transcription stream failed',
    })
  })

  it('observes a streaming rejection while the consumer is paused', async () => {
    let rejectTranscription!: (error: Error) => void
    let signalWaiting!: () => void
    const waitingOnFailure = new Promise<void>((resolve) => {
      signalWaiting = resolve
    })
    const transcriptionFailure = new Promise<never>((_resolve, reject) => {
      rejectTranscription = reject
    })
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(async function* () {
        yield 'Partial text'
        signalWaiting()
        await transcriptionFailure
        return {
          id: 'txn-3',
          model: 'test-model',
          text: 'Partial text',
        }
      }),
    })
    const iterator = generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'base64-audio-data',
      stream: true,
    })[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.next()
    expect((await iterator.next()).value?.type).toBe('TEXT_MESSAGE_CONTENT')
    await waitingOnFailure
    rejectTranscription(new Error('Transcription stream failed while paused'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const error = await iterator.next()
    expect(error.value).toMatchObject({
      type: 'RUN_ERROR',
      message: 'Transcription stream failed while paused',
    })
  })

  it('stops reading a transcription stream when the activity aborts', async () => {
    let releasePendingRead!: () => void
    let signalPendingRead!: () => void
    let signalAdapterClosed!: () => void
    const pendingRead = new Promise<void>((resolve) => {
      releasePendingRead = resolve
    })
    const pendingReadStarted = new Promise<void>((resolve) => {
      signalPendingRead = resolve
    })
    const adapterClosed = new Promise<void>((resolve) => {
      signalAdapterClosed = resolve
    })
    const transcriptionStream = (async function* () {
      try {
        yield 'Partial text'
        signalPendingRead()
        await pendingRead
        yield 'Late text'
        return {
          id: 'txn-4',
          model: 'test-model',
          text: 'Partial textLate text',
        }
      } finally {
        signalAdapterClosed()
      }
    })()
    const iteratorReturn = vi.spyOn(transcriptionStream, 'return')
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(() => transcriptionStream),
    })
    const abortController = new AbortController()
    const iterator = generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'base64-audio-data',
      abortSignal: abortController.signal,
      stream: true,
    })[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.next()
    expect((await iterator.next()).value?.type).toBe('TEXT_MESSAGE_CONTENT')
    await pendingReadStarted
    abortController.abort(new Error('Transcription stopped'))

    const error = await iterator.next()
    expect(error.value).toMatchObject({
      type: 'RUN_ERROR',
      message: 'Transcription stopped',
    })
    expect(iteratorReturn).toHaveBeenCalled()
    releasePendingRead()
    await adapterClosed
    expect((await iterator.next()).done).toBe(true)
  })

  it('aborts transcription when the stream consumer cancels while waiting for text', async () => {
    let releasePendingRead!: () => void
    let signalPendingRead!: () => void
    let signalAbort!: () => void
    let signalAdapterClosed!: () => void
    const pendingRead = new Promise<void>((resolve) => {
      releasePendingRead = resolve
    })
    const pendingReadStarted = new Promise<void>((resolve) => {
      signalPendingRead = resolve
    })
    const transcriptionAborted = new Promise<void>((resolve) => {
      signalAbort = resolve
    })
    const adapterClosed = new Promise<void>((resolve) => {
      signalAdapterClosed = resolve
    })
    let iteratorReturnCalled = false
    const adapter = createMockTranscriptionAdapter({
      transcribeStream: vi.fn(({ abortSignal }) => {
        const transcriptionStream = (async function* () {
          const onAbort = () => signalAbort()
          abortSignal?.addEventListener('abort', onAbort)
          try {
            yield 'Partial text'
            signalPendingRead()
            await pendingRead
            yield 'Late text'
            return {
              id: 'txn-5',
              model: 'test-model',
              text: 'Partial textLate text',
            }
          } finally {
            abortSignal?.removeEventListener('abort', onAbort)
            signalAdapterClosed()
          }
        })()
        const originalReturn =
          transcriptionStream.return.bind(transcriptionStream)
        vi.spyOn(transcriptionStream, 'return').mockImplementation((value) => {
          iteratorReturnCalled = true
          return originalReturn(value)
        })
        return transcriptionStream
      }),
    })
    const iterator = generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'base64-audio-data',
      stream: true,
    })[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.next()
    expect((await iterator.next()).value?.type).toBe('TEXT_MESSAGE_CONTENT')
    const pendingChunk = iterator.next()
    await pendingReadStarted

    const cancellation = iterator.return?.()
    await transcriptionAborted
    expect(await cancellation).toMatchObject({ done: true })
    expect((await pendingChunk).value).toMatchObject({ type: 'RUN_ERROR' })
    expect(iteratorReturnCalled).toBe(true)

    releasePendingRead()
    await adapterClosed
    expect((await iterator.next()).done).toBe(true)
  })
})

// ============================================================================
// Usage on the terminal events of a media stream
// ============================================================================

describe('usage on media stream terminal events', () => {
  const usage = {
    promptTokens: 7,
    completionTokens: 0,
    totalTokens: 7,
    billed: { quantity: 2, unit: 'units' as const },
  }

  function imageAdapter(generateImages: () => Promise<unknown>) {
    return {
      kind: 'image' as const,
      name: 'test-image',
      model: 'test-model',
      '~types': {} as any,
      generateImages: vi.fn(generateImages),
    } as any
  }

  function terminalUsage(chunks: Array<StreamChunk>, type: string) {
    const chunk = chunks.find((c) => c.type === type)
    if (chunk?.type !== 'RUN_FINISHED' && chunk?.type !== 'RUN_ERROR') {
      return undefined
    }
    return rebuildTokenUsage(chunk.usage, tanstackMetadata(chunk)?.usage)
  }

  it('puts the result usage on RUN_FINISHED', async () => {
    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter: imageAdapter(async () => ({
          id: 'img-1',
          model: 'test-model',
          images: [{ url: 'https://example.com/image.png' }],
          usage,
        })),
        prompt: 'A sunset',
        stream: true,
      }),
    )

    expect(terminalUsage(chunks, 'RUN_FINISHED')).toEqual(usage)
  })

  it('puts the usage of a thrown error on RUN_ERROR', async () => {
    const chunks = await collectChunks(
      generateImage({
        threadId: 'thread-1',
        adapter: imageAdapter(async () => {
          throw Object.assign(new Error('no images'), { usage })
        }),
        prompt: 'A sunset',
        stream: true,
      }),
    )

    expect(terminalUsage(chunks, 'RUN_ERROR')).toEqual(usage)
  })

  it('puts the video usage on RUN_FINISHED', async () => {
    const adapter = {
      kind: 'video' as const,
      name: 'test-video',
      model: 'test-model',
      '~types': {} as any,
      snapDuration: () => undefined,
      createVideoJob: vi.fn(async () => ({ jobId: 'job-1', model: 'm' })),
      getVideoStatus: vi.fn(
        async (): Promise<VideoStatusResult> => ({
          jobId: 'job-1',
          status: 'completed',
        }),
      ),
      getVideo: vi.fn(async () => ({
        jobId: 'job-1',
        url: 'https://example.com/video.mp4',
        usage,
      })),
    } as any

    const chunks = await collectChunks(
      generateVideo({
        threadId: 'thread-1',
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 1,
      }),
    )

    expect(terminalUsage(chunks, 'RUN_FINISHED')).toEqual(usage)
  })

  it('sends the transcription:usage devtools event', async () => {
    const emitted: Array<unknown> = []
    const off = aiEventClient.on(
      'transcription:usage',
      (e) => emitted.push(e.payload.usage),
      { withEventTarget: true },
    )
    try {
      await generateTranscription({
        threadId: 'thread-1',
        adapter: {
          kind: 'transcription' as const,
          name: 'test-stt',
          model: 'whisper-1',
          '~types': {} as any,
          transcribe: vi.fn(async () => ({
            id: 't-1',
            model: 'whisper-1',
            text: 'hi',
            usage,
          })),
        } as any,
        audio: 'data:audio/mp3;base64,AAAA',
      })
    } finally {
      off()
    }

    expect(emitted).toEqual([usage])
  })
})
