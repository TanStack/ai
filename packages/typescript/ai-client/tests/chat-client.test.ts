import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
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

      // Update connection via updateOptions
      client.updateOptions({ connection: successAdapter })

      await client.sendMessage('Success')
      expect(client.getError()).toBeUndefined()
    })
  })
})
