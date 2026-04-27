import { describe, it, expect, vi } from 'vitest'
import {
  generateImage,
  generateVideo,
  generateSpeech,
  generateTranscription,
} from '../src/index'
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
      expect(chunks[2]!.finishReason).toBe('stop')
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
        adapter,
        prompt: 'A beautiful sunset',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.error!.message).toBe('Image generation failed')
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

      getVideoUrl: vi.fn(async () => ({
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
      expect(error.error!.message).toBe('Video processing error')
    }
  })

  it('should pass input parameters to createVideoJob', async () => {
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 1 })

    await collectChunks(
      generateVideo({
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
      expect(error.error!.message).toBe('Video generation timed out')
    }
  })

  it('should emit RUN_ERROR when createVideoJob throws', async () => {
    const adapter = createMockVideoAdapter()
    adapter.createVideoJob = vi.fn(async () => {
      throw new Error('Job creation failed')
    })

    const chunks = await collectChunks(
      generateVideo({
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
      expect(error.error!.message).toBe('Job creation failed')
    }
  })

  it('should emit RUN_ERROR when getVideoUrl throws after completed status', async () => {
    const adapter = createMockVideoAdapter({ pollsBeforeComplete: 1 })
    adapter.getVideoUrl = vi.fn(async () => {
      throw new Error('Failed to retrieve video URL')
    })

    const chunks = await collectChunks(
      generateVideo({
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.error!.message).toBe('Failed to retrieve video URL')
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
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.error!.message).toBe('Content policy violation')
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
        adapter,
        prompt: 'test',
        stream: true,
        pollingInterval: 10,
      }),
    )

    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error).toBeDefined()
    if (error?.type === 'RUN_ERROR') {
      expect(error.error!.message).toBe('Video generation failed')
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
      expect(chunks[2]!.finishReason).toBe('stop')
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
        adapter,
        text: 'Hello world',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.error!.message).toBe('Speech generation failed')
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
    }
  }

  it('should emit RUN_STARTED, CUSTOM result, and RUN_FINISHED', async () => {
    const adapter = createMockTranscriptionAdapter()

    const chunks = await collectChunks(
      generateTranscription({
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
      expect(chunks[2]!.finishReason).toBe('stop')
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
        adapter,
        audio: 'base64-audio-data',
        stream: true,
      }),
    )

    expect(chunks).toHaveLength(2)

    expect(chunks[0]!.type).toBe('RUN_STARTED')

    expect(chunks[1]!.type).toBe('RUN_ERROR')
    if (chunks[1]!.type === 'RUN_ERROR') {
      expect(chunks[1]!.error!.message).toBe('Transcription failed')
    }
  })
})
