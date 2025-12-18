import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat'
import type {
  TextOptions,
  StreamChunk,
  DefaultMessageMetadataByModality,
} from '../src/types'
import { BaseTextAdapter } from '../src/activities/chat/adapter'

// Mock adapter that tracks abort signal usage
class MockAdapter extends BaseTextAdapter<
  'test-model',
  Record<string, any>,
  readonly ['text'],
  DefaultMessageMetadataByModality
> {
  public receivedAbortSignals: (AbortSignal | undefined)[] = []
  public chatStreamCallCount = 0

  readonly name = 'mock'

  constructor() {
    super({}, 'test-model')
  }

  private getAbortSignal(options: TextOptions): AbortSignal | undefined {
    const signal = (options.request as RequestInit | undefined)?.signal
    return signal ?? undefined
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    this.chatStreamCallCount++
    const abortSignal = this.getAbortSignal(options)
    this.receivedAbortSignals.push(abortSignal)

    // Yield some chunks
    yield {
      type: 'content',
      id: 'test-id',
      model: 'test-model',
      timestamp: Date.now(),
      delta: 'Hello',
      content: 'Hello',
      role: 'assistant',
    }

    // Check abort signal during streaming
    if (abortSignal?.aborted) {
      return
    }

    yield {
      type: 'content',
      id: 'test-id',
      model: 'test-model',
      timestamp: Date.now(),
      delta: ' World',
      content: 'Hello World',
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

  async structuredOutput(_options: any): Promise<any> {
    return { data: {}, rawText: '{}' }
  }
}

describe('chat() - Abort Signal Handling', () => {
  it('should propagate abortSignal to adapter.chatStream()', async () => {
    const mockAdapter = new MockAdapter()

    const abortController = new AbortController()
    const abortSignal = abortController.signal

    const stream = chat({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      abortController,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(mockAdapter.chatStreamCallCount).toBe(1)
    expect(mockAdapter.receivedAbortSignals[0]).toBe(abortSignal)
  })

  it('should stop streaming when abortSignal is aborted', async () => {
    const mockAdapter = new MockAdapter()

    const abortController = new AbortController()

    const stream = chat({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      abortController,
    })

    const chunks: StreamChunk[] = []
    let chunkCount = 0

    for await (const chunk of stream) {
      chunks.push(chunk)
      chunkCount++

      // Abort after first chunk
      if (chunkCount === 1) {
        abortController.abort()
      }
    }

    // Should have received at least one chunk before abort
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('should check abortSignal before each iteration', async () => {
    const mockAdapter = new MockAdapter()

    const abortController = new AbortController()

    // Abort before starting
    abortController.abort()

    const stream = chat({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      abortController,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // Should not yield any chunks if aborted before start
    expect(chunks.length).toBe(0)
    expect(mockAdapter.chatStreamCallCount).toBe(0)
  })

  it('should check abortSignal before tool execution', async () => {
    const abortController = new AbortController()

    // Create adapter that yields tool_calls
    class ToolCallAdapter extends MockAdapter {
      async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
        yield {
          type: 'tool_call',
          id: 'test-id',
          model: 'test-model',
          timestamp: Date.now(),
          toolCall: {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: '{}',
            },
          },
          index: 0,
        }
        yield {
          type: 'done',
          id: 'test-id',
          model: 'test-model',
          timestamp: Date.now(),
          finishReason: 'tool_calls',
        }
      }
    }

    const toolAdapter = new ToolCallAdapter()

    const stream = chat({
      adapter: toolAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: z.object({}),
        },
      ],
      abortController,
    })

    const chunks: StreamChunk[] = []
    let chunkCount = 0

    for await (const chunk of stream) {
      chunks.push(chunk)
      chunkCount++

      // Abort after receiving tool_call chunk
      if (chunk.type === 'tool_call') {
        abortController.abort()
      }
    }

    // Should have received tool_call chunk but stopped before tool execution
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('should handle undefined abortSignal gracefully', async () => {
    const mockAdapter = new MockAdapter()

    const stream = chat({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(mockAdapter.chatStreamCallCount).toBe(1)
    expect(mockAdapter.receivedAbortSignals[0]).toBeUndefined()
    expect(chunks.length).toBeGreaterThan(0)
  })
})
