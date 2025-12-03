import { describe, expect, it, vi } from 'vitest'
import {
  ImmediateStrategy,
  PunctuationStrategy,
  StreamProcessor,
} from '../src/stream'
import type { StreamProcessorHandlers } from '../src/stream'
import type { StreamChunk, UIMessage } from '../src/types'

// Mock stream generator helper
async function* createMockStream(
  chunks: Array<StreamChunk>,
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
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' How',
          content: 'Hello world! How',
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' are',
          content: 'Hello world! How are',
          role: 'assistant',
        },
        {
          type: 'content',
          id: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: ' you?',
          content: 'Hello world! How are you?',
          role: 'assistant',
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

      const chunks: Array<StreamChunk> = [
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
      const chunks: Array<StreamChunk> = [
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

      // Should have both text segments combined in result.content
      expect(result.content).toBe(
        'Let me check the guitars.Based on the results, I recommend the Taylor.',
      )

      // Should have emitted text updates for both segments separately
      // The first segment should be emitted completely
      expect(textUpdates).toContain('Let me check the guitars.')
      // The second segment is emitted separately (per-segment behavior)
      expect(textUpdates[textUpdates.length - 1]).toBe(
        'Based on the results, I recommend the Taylor.',
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

  describe('Message Management', () => {
    it('should initialize with empty messages', () => {
      const processor = new StreamProcessor({})
      expect(processor.getMessages()).toEqual([])
    })

    it('should initialize with provided messages', () => {
      const initialMessages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
      ]

      const processor = new StreamProcessor({
        initialMessages,
      })

      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.role).toBe('user')
    })

    it('should add user messages', () => {
      const processor = new StreamProcessor({})

      const userMessage = processor.addUserMessage('Hello, AI!')

      expect(userMessage.role).toBe('user')
      expect(userMessage.parts).toHaveLength(1)
      expect(userMessage.parts[0]).toEqual({
        type: 'text',
        content: 'Hello, AI!',
      })
      expect(processor.getMessages()).toHaveLength(1)
    })

    it('should emit onMessagesChange when adding user message', () => {
      const onMessagesChange = vi.fn()
      const processor = new StreamProcessor({
        events: { onMessagesChange },
      })

      processor.addUserMessage('Hello')

      expect(onMessagesChange).toHaveBeenCalledTimes(1)
      expect(onMessagesChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      )
    })

    it('should start and track assistant message during streaming', async () => {
      const onMessagesChange = vi.fn()
      const onStreamStart = vi.fn()
      const onStreamEnd = vi.fn()

      const processor = new StreamProcessor({
        events: {
          onMessagesChange,
          onStreamStart,
          onStreamEnd,
        },
      })

      // Add a user message first
      processor.addUserMessage('What is the weather?')
      onMessagesChange.mockClear()

      // Start streaming
      const messageId = processor.startAssistantMessage()
      expect(messageId).toBeDefined()
      expect(onStreamStart).toHaveBeenCalledTimes(1)

      // Messages should include the empty assistant message
      const messages = processor.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[1]?.role).toBe('assistant')
      expect(messages[1]?.parts).toEqual([])

      // Process a chunk
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'The weather is sunny.',
        content: 'The weather is sunny.',
        role: 'assistant',
      })

      // Finalize
      processor.finalizeStream()
      expect(onStreamEnd).toHaveBeenCalledTimes(1)

      // Final messages should have text content
      const finalMessages = processor.getMessages()
      expect(finalMessages[1]?.parts).toContainEqual({
        type: 'text',
        content: 'The weather is sunny.',
      })
    })

    it('should convert messages to ModelMessages', () => {
      const processor = new StreamProcessor({})

      processor.addUserMessage('Hello')

      const modelMessages = processor.toModelMessages()
      expect(modelMessages).toHaveLength(1)
      expect(modelMessages[0]).toEqual({
        role: 'user',
        content: 'Hello',
      })
    })

    it('should add tool results', async () => {
      const onMessagesChange = vi.fn()
      const processor = new StreamProcessor({
        events: { onMessagesChange },
      })

      // Add user message and start assistant message
      processor.addUserMessage('Get the weather')
      processor.startAssistantMessage()

      // Process a tool call chunk
      processor.processChunk({
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
      })

      processor.finalizeStream()
      onMessagesChange.mockClear()

      // Add tool result
      processor.addToolResult('call_1', {
        temperature: 20,
        conditions: 'sunny',
      })

      expect(onMessagesChange).toHaveBeenCalled()

      // Check that the tool call has output and tool result part exists
      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      expect(assistantMsg?.parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-call',
          id: 'call_1',
          output: { temperature: 20, conditions: 'sunny' },
        }),
      )
      expect(assistantMsg?.parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'call_1',
          state: 'complete',
        }),
      )
    })

    it('should check if all tools are complete', async () => {
      const processor = new StreamProcessor({})

      processor.addUserMessage('Get the weather')
      processor.startAssistantMessage()

      // Process a tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call_1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{}' },
        },
        index: 0,
      })
      processor.finalizeStream()

      // Tool call is complete but no result yet
      expect(processor.areAllToolsComplete()).toBe(false)

      // Add tool result
      processor.addToolResult('call_1', { result: 'sunny' })

      // Now it should be complete
      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should clear messages', () => {
      const onMessagesChange = vi.fn()
      const processor = new StreamProcessor({
        events: { onMessagesChange },
      })

      processor.addUserMessage('Hello')
      processor.addUserMessage('World')
      expect(processor.getMessages()).toHaveLength(2)

      onMessagesChange.mockClear()
      processor.clearMessages()

      expect(processor.getMessages()).toHaveLength(0)
      expect(onMessagesChange).toHaveBeenCalledWith([])
    })

    it('should remove messages after index', () => {
      const processor = new StreamProcessor({})

      processor.addUserMessage('Message 1')
      processor.addUserMessage('Message 2')
      processor.addUserMessage('Message 3')
      expect(processor.getMessages()).toHaveLength(3)

      processor.removeMessagesAfter(0)

      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Message 1',
      })
    })

    it('should set messages manually', () => {
      const processor = new StreamProcessor({})

      const newMessages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Test' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Response' }],
        },
      ]

      processor.setMessages(newMessages)

      expect(processor.getMessages()).toHaveLength(2)
      expect(processor.getMessages()[0]?.role).toBe('user')
      expect(processor.getMessages()[1]?.role).toBe('assistant')
    })
  })
})
