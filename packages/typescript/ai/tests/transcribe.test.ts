/* eslint-disable @typescript-eslint/require-await */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribe, transcribeStream } from '../src/core/transcribe'
import { BaseAdapter } from '../src/base-adapter'
import { aiEventClient } from '../src/event-client.js'
import type {
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionStreamChunk,
} from '../src/types'

// Mock event client to track events
const eventListeners = new Map<string, Set<(...args: Array<unknown>) => void>>()
const capturedEvents: Array<{ type: string; data: unknown }> = []

beforeEach(() => {
  eventListeners.clear()
  capturedEvents.length = 0

  // Mock event client emit
  vi.spyOn(aiEventClient, 'emit').mockImplementation((event, data) => {
    capturedEvents.push({ type: event as string, data })
    const listeners = eventListeners.get(event as string)
    if (listeners) {
      listeners.forEach((listener) => listener(data))
    }
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Mock adapter with transcription support
class MockTranscriptionAdapter extends BaseAdapter<
  readonly ['test-model'],
  readonly [],
  readonly ['transcribe-model'],
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
> {
  name = 'mock'
  models = ['test-model'] as const
  transcriptionModels = ['transcribe-model'] as const
  public transcribeCalls: Array<TranscriptionOptions<string, Record<string, unknown>>> = []
  public transcribeStreamCalls: Array<TranscriptionOptions<string, Record<string, unknown>>> =
    []

  async *chatStream(_options: ChatOptions): AsyncIterable<StreamChunk> {
    yield {
      type: 'content',
      id: 'test-id',
      model: 'test-model',
      timestamp: Date.now(),
      delta: 'Hello',
      content: 'Hello',
      role: 'assistant',
    }
    yield {
      type: 'done',
      id: 'test-id',
      model: 'test-model',
      timestamp: Date.now(),
      finishReason: 'stop',
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    return {
      id: 'summary-id',
      model: options.model,
      summary: 'test',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    return {
      id: 'embedding-id',
      model: options.model,
      embeddings: [],
      usage: {
        promptTokens: 10,
        totalTokens: 10,
      },
    }
  }

  async transcribe(
    options: TranscriptionOptions<string, Record<string, unknown>>,
  ): Promise<TranscriptionResult> {
    this.transcribeCalls.push(options)
    return {
      id: 'transcribe-id',
      model: options.model,
      text: 'Hello, this is a transcription test.',
      language: 'en',
      duration: 5.5,
      usage: {
        type: 'duration',
        seconds: 5.5,
      },
    }
  }

  async *transcribeStream(
    options: TranscriptionOptions<string, Record<string, unknown>>,
  ): AsyncIterable<TranscriptionStreamChunk> {
    this.transcribeStreamCalls.push(options)

    yield {
      type: 'transcript-delta',
      id: 'chunk-1',
      model: options.model,
      timestamp: Date.now(),
      delta: 'Hello, ',
      text: 'Hello, ',
    }
    yield {
      type: 'transcript-delta',
      id: 'chunk-2',
      model: options.model,
      timestamp: Date.now(),
      delta: 'this is a test.',
      text: 'Hello, this is a test.',
    }
    yield {
      type: 'transcript-done',
      id: 'chunk-3',
      model: options.model,
      timestamp: Date.now(),
      text: 'Hello, this is a test.',
      usage: {
        type: 'duration',
        seconds: 3.2,
      },
    }
  }
}

// Mock adapter WITHOUT transcription support
class MockNoTranscriptionAdapter extends BaseAdapter<
  readonly ['test-model'],
  readonly [],
  readonly [],
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
> {
  name = 'mock-no-transcribe'
  models = ['test-model'] as const

  async *chatStream(_options: ChatOptions): AsyncIterable<StreamChunk> {
    yield {
      type: 'done',
      id: 'test-id',
      model: 'test-model',
      timestamp: Date.now(),
      finishReason: 'stop',
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    return {
      id: 'summary-id',
      model: options.model,
      summary: 'test',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    return {
      id: 'embedding-id',
      model: options.model,
      embeddings: [],
      usage: {
        promptTokens: 10,
        totalTokens: 10,
      },
    }
  }
}

// Helper to collect all chunks from a stream
async function collectChunks<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const chunks: Array<T> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('transcribe', () => {
  it('should call adapter transcribe method', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    const result = await transcribe({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    expect(result.text).toBe('Hello, this is a transcription test.')
    expect(result.model).toBe('transcribe-model')
    expect(result.language).toBe('en')
    expect(result.duration).toBe(5.5)
    expect(adapter.transcribeCalls).toHaveLength(1)
    expect(adapter.transcribeCalls[0]?.model).toBe('transcribe-model')
  })

  it('should emit transcribe events', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    await transcribe({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    const startEvent = capturedEvents.find(
      (e) => e.type === 'transcribe:started',
    )
    const completeEvent = capturedEvents.find(
      (e) => e.type === 'transcribe:completed',
    )

    expect(startEvent).toBeDefined()
    expect(completeEvent).toBeDefined()
  })

  it('should throw error if adapter does not support transcription', async () => {
    const adapter = new MockNoTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    await expect(
      transcribe({
        adapter,
        model: 'transcribe-model',
        file: mockFile,
      }),
    ).rejects.toThrow('Transcription is not supported')
  })

  it('should pass provider options to adapter', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    await transcribe({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
      language: 'en',
      prompt: 'Technical discussion',
      providerOptions: {
        customOption: 'value',
      },
    })

    const call = adapter.transcribeCalls[0]
    expect(call?.language).toBe('en')
    expect(call?.prompt).toBe('Technical discussion')
    expect(call?.providerOptions).toEqual({ customOption: 'value' })
  })
})

describe('transcribeStream', () => {
  it('should stream transcription chunks', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    const stream = transcribeStream({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    const chunks = await collectChunks(stream)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.type).toBe('transcript-delta')
    expect(chunks[1]?.type).toBe('transcript-delta')
    expect(chunks[2]?.type).toBe('transcript-done')
  })

  it('should accumulate text correctly in streaming', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    const stream = transcribeStream({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    const chunks = await collectChunks(stream)

    // Check delta chunks have accumulated text
    const deltaChunks = chunks.filter(
      (c): c is Extract<TranscriptionStreamChunk, { type: 'transcript-delta' }> =>
        c.type === 'transcript-delta',
    )
    expect(deltaChunks[0]?.text).toBe('Hello, ')
    expect(deltaChunks[1]?.text).toBe('Hello, this is a test.')

    // Check done chunk has complete text
    const doneChunk = chunks.find(
      (c): c is Extract<TranscriptionStreamChunk, { type: 'transcript-done' }> =>
        c.type === 'transcript-done',
    )
    expect(doneChunk?.text).toBe('Hello, this is a test.')
    expect(doneChunk?.usage?.seconds).toBe(3.2)
  })

  it('should throw error if adapter does not support streaming transcription', async () => {
    const adapter = new MockNoTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    await expect(async () => {
      const stream = transcribeStream({
        adapter,
        model: 'transcribe-model',
        file: mockFile,
      })
      // Need to start iterating to trigger the error
      for await (const _chunk of stream) {
        // This should throw
      }
    }).rejects.toThrow('Streaming transcription is not supported')
  })

  it('should emit stream events for each chunk', async () => {
    const adapter = new MockTranscriptionAdapter()
    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    const stream = transcribeStream({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    await collectChunks(stream)

    const startEvent = capturedEvents.find(
      (e) => e.type === 'transcribe:started',
    )
    expect(startEvent).toBeDefined()

    // Should have stream chunk events
    const chunkEvents = capturedEvents.filter(
      (e) =>
        e.type === 'stream:chunk:transcript' ||
        e.type === 'stream:chunk:transcript-segment',
    )
    expect(chunkEvents.length).toBeGreaterThan(0)
  })
})

describe('transcription error handling', () => {
  it('should emit error event on transcribe failure', async () => {
    const adapter = new MockTranscriptionAdapter()
    // Override transcribe to throw
    adapter.transcribe = async () => {
      throw new Error('Transcription failed')
    }

    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    await expect(
      transcribe({
        adapter,
        model: 'transcribe-model',
        file: mockFile,
      }),
    ).rejects.toThrow('Transcription failed')

    const errorEvent = capturedEvents.find(
      (e) => e.type === 'transcribe:error',
    )
    expect(errorEvent).toBeDefined()
  })

  it('should handle stream errors gracefully', async () => {
    const adapter = new MockTranscriptionAdapter()
    // Override transcribeStream to throw after first chunk
    adapter.transcribeStream = async function* () {
      yield {
        type: 'transcript-delta' as const,
        id: 'chunk-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        text: 'Hello',
      }
      throw new Error('Stream error')
    }

    const mockFile = new Blob(['audio data'], { type: 'audio/wav' })

    const stream = transcribeStream({
      adapter,
      model: 'transcribe-model',
      file: mockFile,
    })

    await expect(collectChunks(stream)).rejects.toThrow('Stream error')
  })
})

describe('audio input types', () => {
  it('should accept File input', async () => {
    const adapter = new MockTranscriptionAdapter()
    const file = new File(['audio data'], 'test.mp3', { type: 'audio/mpeg' })

    const result = await transcribe({
      adapter,
      model: 'transcribe-model',
      file,
    })

    expect(result.text).toBeDefined()
  })

  it('should accept Blob input', async () => {
    const adapter = new MockTranscriptionAdapter()
    const blob = new Blob(['audio data'], { type: 'audio/wav' })

    const result = await transcribe({
      adapter,
      model: 'transcribe-model',
      file: blob,
    })

    expect(result.text).toBeDefined()
  })

  it('should accept ArrayBuffer input', async () => {
    const adapter = new MockTranscriptionAdapter()
    const arrayBuffer = new TextEncoder().encode('audio data').buffer

    const result = await transcribe({
      adapter,
      model: 'transcribe-model',
      file: arrayBuffer,
    })

    expect(result.text).toBeDefined()
  })
})
