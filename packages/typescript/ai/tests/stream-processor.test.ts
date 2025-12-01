import { describe, it, expect, vi } from 'vitest'
import {
  StreamProcessor,
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
} from '../src/stream'
import type { StreamChunk, StreamProcessorHandlers } from '../src/stream/types'

// Mock stream generator helper
async function* createMockStream(
  chunks: StreamChunk[],
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('StreamProcessor (Unified)', () => {
  describe('Text Streaming', () => {
    it('should accumulate text content from delta', async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
        onStreamEnd: vi.fn(),
      }

      const processor = new StreamProcessor({
        chunkStrategy: new ImmediateStrategy(),
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' world',
          content: 'Hello world',
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: '!',
          content: 'Hello world!',
          role: 'assistant',
        },
      ])

      const result = await processor.process(stream)

      expect(result.content).toBe('Hello world!')
      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(3)
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(1, 'Hello')
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(2, 'Hello world')
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(3, 'Hello world!')
    })

    it('should accumulate delta-only chunks', async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' world',
        },
      ])

      const result = await processor.process(stream)

      expect(result.content).toBe('Hello world')
      expect(handlers.onTextUpdate).toHaveBeenCalledWith('Hello')
      expect(handlers.onTextUpdate).toHaveBeenCalledWith('Hello world')
    })

    it('should respect PunctuationStrategy', async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        chunkStrategy: new PunctuationStrategy(),
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' world',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: '!',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' How',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' are',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' you?',
        },
      ])

      await processor.process(stream)

      // Should only emit on punctuation (! and ?)
      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(2)
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(1, 'Hello world!')
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(
        2,
        'Hello world! How are you?',
      )
    })
  })

  describe('Single Tool Call', () => {
    it('should track a single tool call', async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallDelta: vi.fn(),
        onToolCallComplete: vi.fn(),
        onStreamEnd: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"lo' },
          },
          index: 0,
        },
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'getWeather', arguments: 'cation":' },
          },
          index: 0,
        },
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'getWeather', arguments: ' "Paris"}' },
          },
          index: 0,
        },
      ])

      const result = await processor.process(stream)

      // Verify start event
      expect(handlers.onToolCallStart).toHaveBeenCalledTimes(1)
      expect(handlers.onToolCallStart).toHaveBeenCalledWith(
        0,
        'call_1',
        'getWeather',
      )

      // Verify delta events
      expect(handlers.onToolCallDelta).toHaveBeenCalledTimes(3)

      // Verify completion (triggered by stream end)
      expect(handlers.onToolCallComplete).toHaveBeenCalledTimes(1)
      expect(handlers.onToolCallComplete).toHaveBeenCalledWith(
        0,
        'call_1',
        'getWeather',
        '{"location": "Paris"}',
      )

      // Verify result
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0]).toEqual({
        id: 'call_1',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: '{"location": "Paris"}',
        },
      })
    })
  })

  describe('Recording and Replay', () => {
    it('should record chunks when recording is enabled', async () => {
      const processor = new StreamProcessor({ recording: true })

      const chunks: StreamChunk[] = [
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
          role: 'assistant',
        },
        {
          type: 'done',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        },
      ]

      await processor.process(createMockStream(chunks))

      const recording = processor.getRecording()
      expect(recording).toBeDefined()
      expect(recording?.chunks).toHaveLength(2)
      expect(recording?.chunks[0]?.chunk.type).toBe('content')
      expect(recording?.result?.content).toBe('Hello')
    })

    it('should replay a recording and produce the same result', async () => {
      // First, create a recording
      const processor1 = new StreamProcessor({ recording: true })
      const chunks: StreamChunk[] = [
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Test message',
          content: 'Test message',
          role: 'assistant',
        },
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'testTool', arguments: '{"arg":"value"}' },
          },
          index: 0,
        },
        {
          type: 'done',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'tool_calls',
        },
      ]

      const result1 = await processor1.process(createMockStream(chunks))
      const recording = processor1.getRecording()!

      // Now replay the recording
      const result2 = await StreamProcessor.replay(recording)

      // Results should match
      expect(result2.content).toBe(result1.content)
      expect(result2.toolCalls).toEqual(result1.toolCalls)
      expect(result2.finishReason).toBe(result1.finishReason)
    })
  })

  describe('Mixed: Tool Calls + Text', () => {
    it('should complete tool calls when text arrives', async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallComplete: vi.fn(),
        onTextUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"location":"Paris"}' },
          },
          index: 0,
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'The weather in Paris is',
          content: 'The weather in Paris is',
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' sunny',
          content: 'The weather in Paris is sunny',
          role: 'assistant',
        },
      ])

      const result = await processor.process(stream)

      // Tool call should complete when text arrives
      expect(handlers.onToolCallComplete).toHaveBeenCalledWith(
        0,
        'call_1',
        'getWeather',
        '{"location":"Paris"}',
      )

      // Text should accumulate
      expect(result.content).toBe('The weather in Paris is sunny')
      expect(result.toolCalls).toHaveLength(1)
    })

    it('should emit separate text segments when text appears before and after tool calls', async () => {
      const textUpdates: Array<string> = []
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallComplete: vi.fn(),
        onTextUpdate: (text) => textUpdates.push(text),
      }

      const processor = new StreamProcessor({
        handlers,
      })

      // Simulates the Anthropic-style pattern: Text1 -> ToolCall -> Text2
      // Each text segment has its own accumulated content field
      const stream = createMockStream([
        // First text segment
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Let me check the guitars.',
          content: 'Let me check the guitars.',
          role: 'assistant',
        },
        // Tool call
        {
          type: 'tool_call',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          toolCall: {
            id: 'call_1',
            type: 'function',
            function: { name: 'getGuitars', arguments: '{}' },
          },
          index: 0,
        },
        // Second text segment - note the content field starts fresh, not including first segment
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Based on the results,',
          content: 'Based on the results,', // Fresh start, not "Let me check the guitars.Based on..."
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' I recommend the Taylor.',
          content: 'Based on the results, I recommend the Taylor.',
          role: 'assistant',
        },
      ])

      const result = await processor.process(stream)

      // Should have both text segments combined
      expect(result.content).toBe(
        'Let me check the guitars.Based on the results, I recommend the Taylor.',
      )

      // Should have emitted text updates for both segments
      // The first segment should be emitted completely
      expect(textUpdates).toContain('Let me check the guitars.')
      // The final text should include both segments
      expect(textUpdates[textUpdates.length - 1]).toBe(
        'Let me check the guitars.Based on the results, I recommend the Taylor.',
      )

      expect(result.toolCalls).toHaveLength(1)
    })
  })

  describe('Thinking Chunks', () => {
    it('should accumulate thinking content', async () => {
      const handlers: StreamProcessorHandlers = {
        onThinkingUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
      })

      const stream = createMockStream([
        {
          type: 'thinking',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Let me think...',
          content: 'Let me think...',
        },
        {
          type: 'thinking',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' about this',
          content: 'Let me think... about this',
        },
      ])

      const result = await processor.process(stream)

      expect(result.thinking).toBe('Let me think... about this')
      expect(handlers.onThinkingUpdate).toHaveBeenCalledTimes(2)
    })
  })
})
