import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createThinkingChunks,
  createToolCallChunks,
  createCustomEventChunks,
} from './test-utils'
import type { UIMessage } from '../src/types'

describe('ChatClient', () => {
  describe('constructor', () => {
    it('should create a client with default options', () => {
      const adapter = createMockConnectionAdapter()
      const client = new ChatClient({ connection: adapter })

      expect(client.getMessages()).toEqual([])
      expect(client.getIsLoading()).toBe(false)
      expect(client.getError()).toBeUndefined()
    })

    it('should initialize with provided messages', () => {
      const adapter = createMockConnectionAdapter()
      const initialMessages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
          createdAt: new Date(),
        },
      ]

      const client = new ChatClient({
        connection: adapter,
        initialMessages,
      })

      expect(client.getMessages()).toEqual(initialMessages)
    })

    it('should use provided id or generate one', async () => {
      const adapter = createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
      })

      const client1 = new ChatClient({
        connection: adapter,
        id: 'custom-id',
      })

      const client2 = new ChatClient({
        connection: adapter,
      })

      // Message IDs are generated using generateMessageId() from @tanstack/ai
      // Format: `msg-${Date.now()}-${random}`
      await client1.sendMessage('Test')
      await client2.sendMessage('Test')

      const messages1 = client1.getMessages()
      const messages2 = client2.getMessages()

      // Both should have messages with valid IDs
      expect(messages1.length).toBeGreaterThan(0)
      expect(messages2.length).toBeGreaterThan(0)

      // Both clients should generate message IDs with msg- prefix
      const client1MessageId = messages1[0]?.id
      expect(client1MessageId).toMatch(/^msg-/)

      const client2MessageId = messages2[0]?.id
      expect(client2MessageId).toMatch(/^msg-/)

      // Message IDs should be unique between clients
      expect(client1MessageId).not.toBe(client2MessageId)
    })
  })

  describe('sendMessage', () => {
    it('should send a message and append it', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]?.role).toBe('user')
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello',
      })
    })

    it('should create and return assistant message from stream chunks', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      const messages = client.getMessages()

      // Should have both user and assistant messages
      expect(messages.length).toBeGreaterThanOrEqual(2)

      // Find the assistant message created from chunks
      const assistantMessage = messages.find((m) => m.role === 'assistant')
      expect(assistantMessage).toBeDefined()

      if (assistantMessage) {
        // Verify the assistant message is readable and has content
        expect(assistantMessage.id).toBeTruthy()
        expect(assistantMessage.createdAt).toBeInstanceOf(Date)
        expect(assistantMessage.parts.length).toBeGreaterThan(0)

        // Verify it has text content from the chunks
        const textPart = assistantMessage.parts.find((p) => p.type === 'text')
        expect(textPart).toBeDefined()
        if (textPart) {
          expect(textPart.content).toBe('Hello, world!')
        }
      }
    })

    it('should not send empty messages', async () => {
      const adapter = createMockConnectionAdapter()
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('')
      await client.sendMessage('   ')

      expect(client.getMessages().length).toBe(0)
    })

    it('should not send message while loading', async () => {
      const adapter = createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
        chunkDelay: 100,
      })
      const client = new ChatClient({ connection: adapter })

      const promise1 = client.sendMessage('First')
      const promise2 = client.sendMessage('Second')

      await Promise.all([promise1, promise2])

      // Should only have one user message since second was blocked
      const userMessages = client.getMessages().filter((m) => m.role === 'user')
      expect(userMessages.length).toBe(1)
    })
  })

  describe('append', () => {
    it('should append a UIMessage', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      const message: UIMessage = {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: new Date(),
      }

      await client.append(message)

      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]?.id).toBe('user-1')
    })

    it('should convert and append a ModelMessage', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      await client.append({
        role: 'user',
        content: 'Hello from model',
      })

      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]?.role).toBe('user')
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello from model',
      })
    })

    it('should generate id and createdAt if missing', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      const message: UIMessage = {
        id: '',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
      }

      await client.append(message)

      const messages = client.getMessages()
      expect(messages[0]?.id).toBeTruthy()
      expect(messages[0]?.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('reload', () => {
    it('should reload from last user message', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('First')
      await client.sendMessage('Second')

      await client.reload()

      // After reload, messages after the last user message are removed
      // Then the last user message is resent, which triggers a new assistant response
      const messagesAfter = client.getMessages()

      // Should have the same user messages, plus a new assistant response
      const userMessagesAfter = messagesAfter.filter((m) => m.role === 'user')
      expect(userMessagesAfter.length).toBeGreaterThanOrEqual(2)

      // The last user message should match what was resent
      const lastUserMessageAfter =
        userMessagesAfter[userMessagesAfter.length - 1]
      expect(lastUserMessageAfter?.parts[0]).toEqual({
        type: 'text',
        content: 'Second',
      })
    })

    it('should do nothing if no user messages', async () => {
      const adapter = createMockConnectionAdapter()
      const client = new ChatClient({ connection: adapter })

      await client.reload()

      expect(client.getMessages().length).toBe(0)
    })

    it('should do nothing if messages array is empty', async () => {
      const adapter = createMockConnectionAdapter()
      const client = new ChatClient({ connection: adapter })

      await client.reload()

      expect(client.getMessages().length).toBe(0)
    })
  })

  describe('stop', () => {
    it('should stop loading and abort request', async () => {
      const chunks = createTextChunks('Long response that takes time')
      const adapter = createMockConnectionAdapter({
        chunks,
        chunkDelay: 50,
      })
      const client = new ChatClient({ connection: adapter })

      const appendPromise = client.append({
        role: 'user',
        content: 'Hello',
      })

      // Wait a bit then stop
      await new Promise((resolve) => setTimeout(resolve, 10))
      client.stop()

      await appendPromise

      expect(client.getIsLoading()).toBe(false)
      expect(client.getStatus()).toBe('ready')
    })
  })

  describe('clear', () => {
    it('should clear all messages', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      expect(client.getMessages().length).toBeGreaterThan(0)

      client.clear()

      expect(client.getMessages().length).toBe(0)
      expect(client.getError()).toBeUndefined()
    })
  })

  describe('callbacks', () => {
    it('should call onMessagesChange when messages update', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const onMessagesChange = vi.fn()

      const client = new ChatClient({
        connection: adapter,
        onMessagesChange,
      })

      await client.sendMessage('Hello')

      expect(onMessagesChange).toHaveBeenCalled()
      expect(onMessagesChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('should call onLoadingChange when loading state changes', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const onLoadingChange = vi.fn()

      const client = new ChatClient({
        connection: adapter,
        onLoadingChange,
      })

      const promise = client.sendMessage('Hello')

      // Should be called with true
      expect(onLoadingChange).toHaveBeenCalledWith(true)

      await promise

      // Should be called with false
      expect(onLoadingChange).toHaveBeenCalledWith(false)
    })

    it('should call onChunk for each chunk', async () => {
      const chunks = createTextChunks('Hello')
      const adapter = createMockConnectionAdapter({ chunks })
      const onChunk = vi.fn()

      const client = new ChatClient({
        connection: adapter,
        onChunk,
      })

      await client.sendMessage('Hello')

      expect(onChunk).toHaveBeenCalled()
      expect(onChunk.mock.calls.length).toBeGreaterThan(0)
    })

    it('should call onFinish when stream completes', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const onFinish = vi.fn()

      const client = new ChatClient({
        connection: adapter,
        onFinish,
      })

      await client.sendMessage('Hello')

      expect(onFinish).toHaveBeenCalled()
      const finishCall = onFinish.mock.calls[0]?.[0]
      expect(finishCall?.role).toBe('assistant')
    })

    it('should call onError when error occurs', async () => {
      const error = new Error('Connection failed')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const onError = vi.fn()

      const client = new ChatClient({
        connection: adapter,
        onError,
      })

      await client.sendMessage('Hello')

      expect(onError).toHaveBeenCalledWith(error)
      expect(client.getError()).toBe(error)
    })
  })

  describe('status', () => {
    it('should transition through states during generation', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({
        chunks,
        chunkDelay: 20,
      })
      const statuses: Array<string> = []
      const client = new ChatClient({
        connection: adapter,
        onStatusChange: (s) => statuses.push(s),
      })

      const promise = client.sendMessage('Test')

      // Should leave ready state
      expect(client.getStatus()).not.toBe('ready')

      // Should be submitted or streaming
      expect(['submitted', 'streaming']).toContain(client.getStatus())

      await promise

      expect(statuses).toContain('submitted')
      expect(statuses).toContain('streaming')
      expect(statuses[statuses.length - 1]).toBe('ready')
    })
  })

  describe('tool calls', () => {
    it('should handle tool calls from stream', async () => {
      const chunks = createToolCallChunks([
        { id: 'tool-1', name: 'get_weather', arguments: '{"city": "NYC"}' },
      ])
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage("What's the weather?")

      const messages = client.getMessages()
      const assistantMessage = messages.find((m) => m.role === 'assistant')

      expect(assistantMessage).toBeDefined()
      if (assistantMessage) {
        const toolCallPart = assistantMessage.parts.find(
          (p) => p.type === 'tool-call',
        )
        expect(toolCallPart).toBeDefined()
        if (toolCallPart) {
          expect(toolCallPart.name).toBe('get_weather')
        }
      }
    })

    // Tests for legacy onToolCall removed - now using client tools with execute functions
  })

  describe('addToolResult', () => {
    it('should add tool result and update message', async () => {
      const chunks = createToolCallChunks([
        { id: 'tool-1', name: 'test_tool', arguments: '{}' },
      ])
      const adapter = createMockConnectionAdapter({ chunks })
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Test')

      // Find the tool call
      const messages = client.getMessages()
      const assistantMessage = messages.find((m) => m.role === 'assistant')
      const toolCallPart = assistantMessage?.parts.find(
        (p) => p.type === 'tool-call',
      )

      if (toolCallPart) {
        await client.addToolResult({
          toolCallId: toolCallPart.id,
          tool: toolCallPart.name,
          output: { result: 'success' },
        })

        // Tool call should have output
        const updatedMessages = client.getMessages()
        const updatedAssistant = updatedMessages.find(
          (m) => m.role === 'assistant',
        )
        const updatedToolCall = updatedAssistant?.parts.find(
          (p) => p.type === 'tool-call' && p.id === toolCallPart.id,
        )

        if (updatedToolCall && updatedToolCall.type === 'tool-call') {
          expect(updatedToolCall.output).toEqual({ result: 'success' })
        }
      }
    })
  })

  describe('error handling', () => {
    it('should set error state on connection failure', async () => {
      const error = new Error('Network error')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      expect(client.getError()).toBe(error)
      expect(client.getStatus()).toBe('error')
    })

    it('should clear error on successful request', async () => {
      const errorAdapter = createMockConnectionAdapter({
        shouldError: true,
        error: new Error('First error'),
      })
      const successAdapter = createMockConnectionAdapter({
        chunks: createTextChunks('Success'),
      })

      const client = new ChatClient({ connection: errorAdapter })

      await client.sendMessage('Fail')
      expect(client.getError()).toBeDefined()
      expect(client.getStatus()).toBe('error')

      // Update connection via updateOptions
      client.updateOptions({ connection: successAdapter })

      await client.sendMessage('Success')
      expect(client.getError()).toBeUndefined()
      expect(client.getStatus()).not.toBe('error')
    })
  })

  describe('devtools events', () => {
    it('should emit text:message:created event when assistant message starts', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai/event-client')
      const emitSpy = vi.spyOn(aiEventClient, 'emit')

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      // Find the message-created event for the assistant message
      const messageCreatedCalls = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'text:message:created',
      )

      // Should have at least one call for the assistant message
      const assistantCreatedCall = messageCreatedCalls.find(([, data]) => {
        const payload = data as any
        return payload && payload.role === 'assistant'
      })
      expect(assistantCreatedCall).toBeDefined()
    })

    it('should emit text:chunk:content events during streaming', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai/event-client')
      const emitSpy = vi.spyOn(aiEventClient, 'emit')

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      // Find text-updated events
      const textUpdatedCalls = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'text:chunk:content',
      )

      // Should have text update events
      expect(textUpdatedCalls.length).toBeGreaterThan(0)
    })

    it('should emit tools:call:updated events for tool calls', async () => {
      const chunks = createToolCallChunks([
        { id: 'tool-1', name: 'getWeather', arguments: '{"city": "NYC"}' },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai/event-client')
      const emitSpy = vi.spyOn(aiEventClient, 'emit')

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('What is the weather?')

      // Find tool call events
      const toolCallUpdatedCalls = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'tools:call:updated',
      )

      // Should have tool call events
      expect(toolCallUpdatedCalls.length).toBeGreaterThan(0)
    })

    it('should emit text:chunk:thinking events for thinking content', async () => {
      const chunks = createThinkingChunks(
        'Let me think...',
        'Here is my answer',
      )
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai/event-client')
      const emitSpy = vi.spyOn(aiEventClient, 'emit')

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      // Find thinking events
      const thinkingCalls = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'text:chunk:thinking',
      )

      // Should have thinking events
      expect(thinkingCalls.length).toBeGreaterThan(0)
    })
  })

  describe('multimodal sendMessage', () => {
    it('should send a multimodal message with image content', async () => {
      const chunks = createTextChunks('I see a cat in the image')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [
          { type: 'text', content: 'What is in this image?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/cat.jpg' },
          },
        ],
      })

      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]?.role).toBe('user')
      expect(messages[0]?.parts.length).toBe(2)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'What is in this image?',
      })
      expect(messages[0]?.parts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/cat.jpg' },
      })
    })

    it('should send a multimodal message with audio content', async () => {
      const chunks = createTextChunks('The audio says hello')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [
          { type: 'text', content: 'Transcribe this audio' },
          {
            type: 'audio',
            source: {
              type: 'data',
              value: 'base64AudioData',
              mimeType: 'audio/mp3',
            },
          },
        ],
      })

      const messages = client.getMessages()
      expect(messages[0]?.parts[1]).toEqual({
        type: 'audio',
        source: {
          type: 'data',
          value: 'base64AudioData',
          mimeType: 'audio/mp3',
        },
      })
    })

    it('should send a multimodal message with video content', async () => {
      const chunks = createTextChunks('The video shows a sunset')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [
          { type: 'text', content: 'Describe this video' },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/video.mp4' },
          },
        ],
      })

      const messages = client.getMessages()
      expect(messages[0]?.parts[1]).toEqual({
        type: 'video',
        source: { type: 'url', value: 'https://example.com/video.mp4' },
      })
    })

    it('should send a multimodal message with document content', async () => {
      const chunks = createTextChunks('The document discusses AI')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [
          { type: 'text', content: 'Summarize this PDF' },
          {
            type: 'document',
            source: {
              type: 'data',
              value: 'base64PdfData',
              mimeType: 'application/pdf',
            },
          },
        ],
      })

      const messages = client.getMessages()
      expect(messages[0]?.parts[1]).toEqual({
        type: 'document',
        source: {
          type: 'data',
          value: 'base64PdfData',
          mimeType: 'application/pdf',
        },
      })
    })

    it('should use custom message id when provided', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: 'Hello',
        id: 'custom-message-id-123',
      })

      const messages = client.getMessages()
      expect(messages[0]?.id).toBe('custom-message-id-123')
    })

    it('should generate message id when not provided', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: 'Hello',
      })

      const messages = client.getMessages()
      expect(messages[0]?.id).toMatch(/^msg-/)
    })

    it('should allow empty content array', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [],
      })

      const messages = client.getMessages()
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]?.parts).toEqual([])
    })

    it('should send string content as simple text message', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: 'Hello world',
      })

      const messages = client.getMessages()
      expect(messages[0]?.parts).toEqual([
        { type: 'text', content: 'Hello world' },
      ])
    })

    it('should merge per-message body with base body', async () => {
      const chunks = createTextChunks('Response')
      let capturedData: Record<string, any> | undefined
      const adapter = createMockConnectionAdapter({
        chunks,
        onConnect: (_messages, data) => {
          capturedData = data
        },
      })

      const client = new ChatClient({
        connection: adapter,
        body: { model: 'gpt-4', temperature: 0.7 },
      })

      await client.sendMessage('Hello', {
        model: 'gpt-4-turbo',
        maxTokens: 100,
      })

      // Per-message body should override base body
      expect(capturedData?.model).toBe('gpt-4-turbo')
      expect(capturedData?.temperature).toBe(0.7) // From base body
      expect(capturedData?.maxTokens).toBe(100) // From per-message body
    })

    it('should include conversationId in merged body', async () => {
      const chunks = createTextChunks('Response')
      let capturedData: Record<string, any> | undefined
      const adapter = createMockConnectionAdapter({
        chunks,
        onConnect: (_messages, data) => {
          capturedData = data
        },
      })

      const client = new ChatClient({
        connection: adapter,
        id: 'my-conversation',
      })

      await client.sendMessage('Hello')

      expect(capturedData?.conversationId).toBe('my-conversation')
    })

    it('should clear per-message body after request', async () => {
      const chunks = createTextChunks('Response')
      let capturedData: Record<string, any> | undefined
      const adapter = createMockConnectionAdapter({
        chunks,
        onConnect: (_messages, data) => {
          capturedData = data
        },
      })

      const client = new ChatClient({
        connection: adapter,
        body: { model: 'gpt-4' },
      })

      // First message with per-message body
      await client.sendMessage('First', { temperature: 0.9 })
      expect(capturedData?.temperature).toBe(0.9)

      // Second message without per-message body should not have temperature
      await client.sendMessage('Second')
      expect(capturedData?.temperature).toBeUndefined()
      expect(capturedData?.model).toBe('gpt-4')
    })

    it('should emit events with multimodal content', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai/event-client')
      const emitSpy = vi.spyOn(aiEventClient, 'emit')
      emitSpy.mockClear() // Clear any previous calls

      const client = new ChatClient({ connection: adapter })

      await client.sendMessage({
        content: [
          { type: 'text', content: 'What is this?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img.jpg' },
          },
        ],
      })

      // Find message created events for user role
      const userMessageCreatedCalls = emitSpy.mock.calls.filter(
        ([eventName, data]) =>
          eventName === 'text:message:created' &&
          (data as any)?.role === 'user',
      )

      // Should have at least one user message created event
      expect(userMessageCreatedCalls.length).toBeGreaterThan(0)

      // The event should include the text content extracted from multimodal content
      const userMessageEvent = userMessageCreatedCalls[0]
      expect((userMessageEvent?.[1] as any)?.content).toBe('What is this?')
    })
  })

  describe('custom events', () => {
    it('should call onCustomEvent callback for arbitrary custom events', async () => {
      const chunks = createCustomEventChunks([
        { name: 'progress-update', data: { progress: 50, step: 'processing' } },
        {
          name: 'tool-status',
          data: { toolCallId: 'tc-1', status: 'running' },
        },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Hello')

      expect(onCustomEvent).toHaveBeenCalledTimes(2)
      expect(onCustomEvent).toHaveBeenNthCalledWith(
        1,
        'progress-update',
        { progress: 50, step: 'processing' },
        { toolCallId: undefined },
      )
      expect(onCustomEvent).toHaveBeenNthCalledWith(
        2,
        'tool-status',
        { toolCallId: 'tc-1', status: 'running' },
        { toolCallId: 'tc-1' },
      )
    })

    it('should extract toolCallId from custom event data and pass in context', async () => {
      const chunks = createCustomEventChunks([
        {
          name: 'external-api-call',
          data: {
            toolCallId: 'tc-123',
            url: 'https://api.example.com',
            method: 'POST',
          },
        },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Test')

      expect(onCustomEvent).toHaveBeenCalledWith(
        'external-api-call',
        {
          toolCallId: 'tc-123',
          url: 'https://api.example.com',
          method: 'POST',
        },
        { toolCallId: 'tc-123' },
      )
    })

    it('should handle custom events with no data', async () => {
      const chunks = createCustomEventChunks([{ name: 'simple-notification' }])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Test')

      expect(onCustomEvent).toHaveBeenCalledWith(
        'simple-notification',
        undefined,
        { toolCallId: undefined },
      )
    })

    it('should NOT call onCustomEvent for system events like tool-input-available', async () => {
      const chunks = createToolCallChunks([
        { id: 'tc-1', name: 'testTool', arguments: '{}' },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Test tool call')

      // Should not have been called for tool-input-available system event
      expect(onCustomEvent).not.toHaveBeenCalled()
    })

    it('should work when onCustomEvent is not provided', async () => {
      const chunks = createCustomEventChunks([
        { name: 'some-event', data: { info: 'test' } },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      // Should not throw error when onCustomEvent is undefined
      await expect(client.sendMessage('Test')).resolves.not.toThrow()
    })

    it('should allow updating onCustomEvent via updateOptions', async () => {
      const chunks = createCustomEventChunks([
        { name: 'test-event', data: { value: 42 } },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      const onCustomEvent = vi.fn()
      client.updateOptions({ onCustomEvent })

      await client.sendMessage('Test')

      expect(onCustomEvent).toHaveBeenCalledWith(
        'test-event',
        { value: 42 },
        { toolCallId: undefined },
      )
    })

    it('should handle multiple different custom events in sequence', async () => {
      const chunks = createCustomEventChunks([
        { name: 'step-1', data: { stage: 'init' } },
        { name: 'step-2', data: { stage: 'process', toolCallId: 'tc-1' } },
        { name: 'step-3', data: { stage: 'complete' } },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Multi-step process')

      expect(onCustomEvent).toHaveBeenCalledTimes(3)
      expect(onCustomEvent).toHaveBeenNthCalledWith(
        1,
        'step-1',
        { stage: 'init' },
        { toolCallId: undefined },
      )
      expect(onCustomEvent).toHaveBeenNthCalledWith(
        2,
        'step-2',
        { stage: 'process', toolCallId: 'tc-1' },
        { toolCallId: 'tc-1' },
      )
      expect(onCustomEvent).toHaveBeenNthCalledWith(
        3,
        'step-3',
        { stage: 'complete' },
        { toolCallId: undefined },
      )
    })

    it('should preserve event data exactly as received from stream', async () => {
      const complexEventData = {
        nested: { object: { with: 'values' } },
        array: [1, 2, 3],
        null_value: null,
        boolean: true,
        number: 42,
      }

      const chunks = createCustomEventChunks([
        { name: 'complex-data-event', data: complexEventData },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const onCustomEvent = vi.fn()
      const client = new ChatClient({ connection: adapter, onCustomEvent })

      await client.sendMessage('Complex data test')

      expect(onCustomEvent).toHaveBeenCalledWith(
        'complex-data-event',
        complexEventData,
        { toolCallId: undefined },
      )

      // Verify the data object is preserved exactly
      const actualData = onCustomEvent.mock.calls[0]?.[1]
      expect(actualData).toEqual(complexEventData)
      expect(actualData.nested.object.with).toBe('values')
      expect(actualData.array).toEqual([1, 2, 3])
      expect(actualData.null_value).toBeNull()
    })
  })
})
