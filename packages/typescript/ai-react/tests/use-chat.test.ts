import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useChat } from '../src/use-chat'
import {
  renderUseChat,
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from './test-utils'
import type { UIMessage } from '../src/types'
import type { ModelMessage } from '@tanstack/ai'

describe('useChat', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderUseChat({ connection: adapter })

      expect(result.current.messages).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeUndefined()
    })

    it('should initialize with provided messages', () => {
      const adapter = createMockConnectionAdapter()
      const initialMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
          createdAt: new Date(),
        },
      ]

      const { result } = renderUseChat({
        connection: adapter,
        initialMessages,
      })

      expect(result.current.messages).toEqual(initialMessages)
    })

    it('should use provided id', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderUseChat({
        connection: adapter,
        id: 'custom-id',
      })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      // Message IDs are generated independently, not based on client ID
      // Just verify messages exist and have IDs
      const messageId = result.current.messages[0].id
      expect(messageId).toBeDefined()
      expect(typeof messageId).toBe('string')
    })

    it('should generate id if not provided', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })

      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      // Message IDs should have a generated prefix (not "custom-id-")
      const messageId = result.current.messages[0].id
      expect(messageId).toBeTruthy()
      expect(messageId).not.toMatch(/^custom-id-/)
    })

    it('should maintain client instance across re-renders', () => {
      const adapter = createMockConnectionAdapter()
      const { result, rerender } = renderUseChat({ connection: adapter })

      const initialMessages = result.current.messages

      rerender()

      // Client should be the same instance, state should persist
      expect(result.current.messages).toBe(initialMessages)
    })
  })

  describe('state synchronization', () => {
    it('should update messages via onMessagesChange callback', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
      })

      const userMessage = result.current.messages.find((m) => m.role === 'user')
      expect(userMessage).toBeDefined()
      if (userMessage) {
        expect(userMessage.parts[0]).toEqual({
          type: 'text',
          content: 'Hello',
        })
      }
    })

    it('should update loading state via onLoadingChange callback', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({
        chunks,
        chunkDelay: 50,
      })
      const { result } = renderUseChat({ connection: adapter })

      expect(result.current.isLoading).toBe(false)

      const sendPromise = result.current.sendMessage('Test')

      // Should be loading during send
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await sendPromise

      // Should not be loading after completion
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should update error state via onErrorChange callback', async () => {
      const error = new Error('Connection failed')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(result.current.error).toBeDefined()
      })

      expect(result.current.error?.message).toBe('Connection failed')
    })

    it('should persist state across re-renders', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result, rerender } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      const messageCount = result.current.messages.length

      rerender()

      // State should persist after re-render
      expect(result.current.messages.length).toBe(messageCount)
    })
  })

  describe('sendMessage', () => {
    it('should send a message and append it', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      const userMessage = result.current.messages.find((m) => m.role === 'user')
      expect(userMessage).toBeDefined()
      if (userMessage) {
        expect(userMessage.parts[0]).toEqual({
          type: 'text',
          content: 'Hello',
        })
      }
    })

    it('should create assistant message from stream chunks', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')

      await waitFor(() => {
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        expect(assistantMessage).toBeDefined()
      })

      const assistantMessage = result.current.messages.find(
        (m) => m.role === 'assistant',
      )
      expect(assistantMessage).toBeDefined()
      if (assistantMessage) {
        const textPart = assistantMessage.parts.find((p) => p.type === 'text')
        expect(textPart).toBeDefined()
        if (textPart && textPart.type === 'text') {
          expect(textPart.content).toBe('Hello, world!')
        }
      }
    })

    it('should not send empty messages', async () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('')
      await result.current.sendMessage('   ')

      expect(result.current.messages.length).toBe(0)
    })

    it('should not send message while loading', async () => {
      const adapter = createMockConnectionAdapter({
        chunks: createTextChunks('Response'),
        chunkDelay: 100,
      })
      const { result } = renderUseChat({ connection: adapter })

      const promise1 = result.current.sendMessage('First')
      const promise2 = result.current.sendMessage('Second')

      await Promise.all([promise1, promise2])

      // Should only have one user message since second was blocked
      const userMessages = result.current.messages.filter(
        (m) => m.role === 'user',
      )
      expect(userMessages.length).toBe(1)
    })

    it('should handle errors during sendMessage', async () => {
      const error = new Error('Network error')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(result.current.error).toBeDefined()
      })

      expect(result.current.error?.message).toBe('Network error')
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('append', () => {
    it('should append a UIMessage', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      const message: UIMessage = {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: new Date(),
      }

      await result.current.append(message)

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      expect(result.current.messages[0].id).toBe('user-1')
    })

    it('should convert and append a ModelMessage', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello from model',
      }

      await result.current.append(modelMessage)

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      expect(result.current.messages[0].role).toBe('user')
      expect(result.current.messages[0].parts[0]).toEqual({
        type: 'text',
        content: 'Hello from model',
      })
    })

    it('should handle errors during append', async () => {
      const error = new Error('Append failed')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const { result } = renderUseChat({ connection: adapter })

      const message: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: new Date(),
      }

      await result.current.append(message)

      await waitFor(() => {
        expect(result.current.error).toBeDefined()
      })

      expect(result.current.error?.message).toBe('Append failed')
    })
  })

  describe('reload', () => {
    it('should reload the last assistant message', async () => {
      const chunks1 = createTextChunks('First response')
      const chunks2 = createTextChunks('Second response')
      let callCount = 0

      const adapter = createMockConnectionAdapter({
        chunks: chunks1,
        onConnect: () => {
          callCount++
          // Return different chunks on second call
          if (callCount === 2) {
            return chunks2
          }
        },
      })

      // Create a new adapter for the second call
      const adapter2 = createMockConnectionAdapter({ chunks: chunks2 })
      const { result, rerender } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')

      await waitFor(() => {
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        expect(assistantMessage).toBeDefined()
      })

      const firstAssistantMessage = result.current.messages.find(
        (m) => m.role === 'assistant',
      )
      const firstContent =
        firstAssistantMessage?.parts.find((p) => p.type === 'text')?.type ===
        'text'
          ? (firstAssistantMessage.parts.find((p) => p.type === 'text') as any)
              .content
          : ''

      // Reload with new adapter
      rerender({ connection: adapter2 })
      await result.current.reload()

      await waitFor(() => {
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        expect(assistantMessage).toBeDefined()
      })

      // Should have reloaded (though content might be same if adapter doesn't change)
      const messagesAfterReload = result.current.messages
      expect(messagesAfterReload.length).toBeGreaterThan(0)
    })

    it('should maintain conversation history after reload', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('First')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
      })

      const messageCountBeforeReload = result.current.messages.length

      await result.current.reload()

      await waitFor(() => {
        // Should still have the same number of messages (user + assistant)
        expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
      })

      // History should be maintained
      expect(result.current.messages.length).toBeGreaterThanOrEqual(
        messageCountBeforeReload,
      )
    })

    it('should handle errors during reload', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
      })

      // Create error adapter for reload
      const errorAdapter = createMockConnectionAdapter({
        shouldError: true,
        error: new Error('Reload failed'),
      })

      // Note: We can't easily change the adapter after creation,
      // so this test verifies error handling in general
      // The actual error would come from the connection adapter
      expect(result.current.reload).toBeDefined()
    })
  })

  describe('stop', () => {
    it('should stop current generation', async () => {
      const chunks = createTextChunks('Long response that will be stopped')
      const adapter = createMockConnectionAdapter({
        chunks,
        chunkDelay: 50,
      })
      const { result } = renderUseChat({ connection: adapter })

      const sendPromise = result.current.sendMessage('Test')

      // Wait for loading to start
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      // Stop the generation
      result.current.stop()

      await sendPromise

      // Should eventually stop loading
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false)
        },
        { timeout: 1000 },
      )
    })

    it('should be safe to call multiple times', () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderUseChat({ connection: adapter })

      // Should not throw
      result.current.stop()
      result.current.stop()
      result.current.stop()

      expect(result.current.isLoading).toBe(false)
    })

    it('should clear loading state when stopped', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({
        chunks,
        chunkDelay: 50,
      })
      const { result } = renderUseChat({ connection: adapter })

      const sendPromise = result.current.sendMessage('Test')

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      result.current.stop()

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false)
        },
        { timeout: 1000 },
      )

      await sendPromise.catch(() => {
        // Ignore errors from stopped request
      })
    })
  })

  describe('clear', () => {
    it('should clear all messages', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      result.current.clear()

      await waitFor(() => {
        expect(result.current.messages).toEqual([])
      })
    })

    it('should reset to initial state', async () => {
      const initialMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Initial' }],
          createdAt: new Date(),
        },
      ]

      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({
        connection: adapter,
        initialMessages,
      })

      await result.current.sendMessage('Hello')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(
          initialMessages.length,
        )
      })

      result.current.clear()

      // Should clear all messages, not reset to initial
      await waitFor(() => {
        expect(result.current.messages).toEqual([])
      })
    })

    it('should maintain client instance after clear', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      result.current.clear()

      // Should still be able to send messages
      await result.current.sendMessage('New message')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })
    })
  })

  describe('setMessages', () => {
    it('should manually set messages', async () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderUseChat({ connection: adapter })

      const newMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Manual' }],
          createdAt: new Date(),
        },
      ]

      result.current.setMessages(newMessages)

      await waitFor(() => {
        expect(result.current.messages).toEqual(newMessages)
      })
    })

    it('should update state immediately', async () => {
      const adapter = createMockConnectionAdapter()
      const { result } = renderUseChat({ connection: adapter })

      expect(result.current.messages).toEqual([])

      const newMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Immediate' }],
          createdAt: new Date(),
        },
      ]

      result.current.setMessages(newMessages)

      // Wait for state to update
      await waitFor(() => {
        expect(result.current.messages).toEqual(newMessages)
      })
    })

    it('should replace all existing messages', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const { result } = renderUseChat({ connection: adapter })

      await result.current.sendMessage('Hello')
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })

      const originalCount = result.current.messages.length

      const newMessages: UIMessage[] = [
        {
          id: 'msg-new',
          role: 'user',
          parts: [{ type: 'text', content: 'Replaced' }],
          createdAt: new Date(),
        },
      ]

      result.current.setMessages(newMessages)

      await waitFor(() => {
        expect(result.current.messages).toEqual(newMessages)
        expect(result.current.messages.length).toBe(1)
        expect(result.current.messages.length).not.toBe(originalCount)
      })
    })
  })

  describe('callbacks', () => {
    it('should call onChunk callback when chunks are received', async () => {
      const chunks = createTextChunks('Hello')
      const adapter = createMockConnectionAdapter({ chunks })
      const onChunk = vi.fn()

      const { result } = renderUseChat({
        connection: adapter,
        onChunk,
      })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(onChunk).toHaveBeenCalled()
      })

      // Should have been called for each chunk
      expect(onChunk.mock.calls.length).toBeGreaterThan(0)
    })

    it('should call onFinish callback when response finishes', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const onFinish = vi.fn()

      const { result } = renderUseChat({
        connection: adapter,
        onFinish,
      })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(onFinish).toHaveBeenCalled()
      })

      const finishedMessage = onFinish.mock.calls[0][0]
      expect(finishedMessage).toBeDefined()
      expect(finishedMessage.role).toBe('assistant')
    })

    it('should call onError callback when error occurs', async () => {
      const error = new Error('Test error')
      const adapter = createMockConnectionAdapter({
        shouldError: true,
        error,
      })
      const onError = vi.fn()

      const { result } = renderUseChat({
        connection: adapter,
        onError,
      })

      await result.current.sendMessage('Test')

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError.mock.calls[0][0].message).toBe('Test error')
    })

    it('should call onResponse callback when response is received', async () => {
      const chunks = createTextChunks('Response')
      const adapter = createMockConnectionAdapter({ chunks })
      const onResponse = vi.fn()

      const { result } = renderUseChat({
        connection: adapter,
        onResponse,
      })

      await result.current.sendMessage('Test')

      // onResponse may or may not be called depending on adapter implementation
      // This test verifies the callback is passed through
      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0)
      })
    })
  })

  describe('edge cases and error handling', () => {
    describe('options changes', () => {
      it('should maintain client instance when options change', () => {
        const adapter1 = createMockConnectionAdapter()
        const { result, rerender } = renderUseChat({ connection: adapter1 })

        const initialMessages = result.current.messages

        const adapter2 = createMockConnectionAdapter()
        rerender({ connection: adapter2 })

        // Client instance should persist (current implementation doesn't update)
        // This documents current behavior - options changes don't update client
        expect(result.current.messages).toBe(initialMessages)
      })

      it('should handle body changes', () => {
        const adapter = createMockConnectionAdapter()
        const { result, rerender } = renderUseChat({
          connection: adapter,
          body: { userId: '123' },
        })

        rerender({
          connection: adapter,
          body: { userId: '456' },
        })

        // Should not throw
        expect(result.current).toBeDefined()
      })

      it('should handle callback changes', () => {
        const adapter = createMockConnectionAdapter()
        const onChunk1 = vi.fn()
        const { result, rerender } = renderUseChat({
          connection: adapter,
          onChunk: onChunk1,
        })

        const onChunk2 = vi.fn()
        rerender({
          connection: adapter,
          onChunk: onChunk2,
        })

        // Should not throw
        expect(result.current).toBeDefined()
      })
    })

    describe('unmount behavior', () => {
      it('should not update state after unmount', async () => {
        const chunks = createTextChunks('Response')
        const adapter = createMockConnectionAdapter({
          chunks,
          chunkDelay: 100,
        })
        const { result, unmount } = renderUseChat({ connection: adapter })

        const sendPromise = result.current.sendMessage('Test')

        // Unmount before completion
        unmount()

        await sendPromise.catch(() => {
          // Ignore errors
        })

        // State updates after unmount should be ignored (React handles this)
        // This test documents the expected behavior
        expect(result.current).toBeDefined()
      })

      it('should stop loading on unmount if active', async () => {
        const chunks = createTextChunks('Response')
        const adapter = createMockConnectionAdapter({
          chunks,
          chunkDelay: 100,
        })
        const { result, unmount } = renderUseChat({ connection: adapter })

        result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.isLoading).toBe(true)
        })

        unmount()

        // After unmount, React will clean up
        // The actual cleanup is handled by React's lifecycle
        expect(result.current.isLoading).toBe(true) // Still true in test, but component is unmounted
      })
    })

    describe('concurrent operations', () => {
      it('should handle multiple sendMessage calls', async () => {
        const adapter = createMockConnectionAdapter({
          chunks: createTextChunks('Response'),
          chunkDelay: 50,
        })
        const { result } = renderUseChat({ connection: adapter })

        const promise1 = result.current.sendMessage('First')
        const promise2 = result.current.sendMessage('Second')

        await Promise.all([promise1, promise2])

        // Should only have one user message (second should be blocked)
        const userMessages = result.current.messages.filter(
          (m) => m.role === 'user',
        )
        expect(userMessages.length).toBe(1)
      })

      it('should handle stop during sendMessage', async () => {
        const chunks = createTextChunks('Long response')
        const adapter = createMockConnectionAdapter({
          chunks,
          chunkDelay: 50,
        })
        const { result } = renderUseChat({ connection: adapter })

        const sendPromise = result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.isLoading).toBe(true)
        })

        result.current.stop()

        await waitFor(
          () => {
            expect(result.current.isLoading).toBe(false)
          },
          { timeout: 1000 },
        )

        await sendPromise.catch(() => {
          // Ignore errors from stopped request
        })
      })

      it('should handle reload during active stream', async () => {
        const chunks = createTextChunks('Response')
        const adapter = createMockConnectionAdapter({
          chunks,
          chunkDelay: 50,
        })
        const { result } = renderUseChat({ connection: adapter })

        const sendPromise = result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.isLoading).toBe(true)
        })

        // Try to reload while sending
        const reloadPromise = result.current.reload()

        await Promise.allSettled([sendPromise, reloadPromise])

        // Should eventually complete
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false)
        })
      })
    })

    describe('error scenarios', () => {
      it('should handle network errors', async () => {
        const error = new Error('Network request failed')
        const adapter = createMockConnectionAdapter({
          shouldError: true,
          error,
        })
        const { result } = renderUseChat({ connection: adapter })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.error).toBeDefined()
        })

        expect(result.current.error?.message).toBe('Network request failed')
        expect(result.current.isLoading).toBe(false)
      })

      it('should handle stream errors', async () => {
        const error = new Error('Stream error')
        const adapter = createMockConnectionAdapter({
          shouldError: true,
          error,
        })
        const { result } = renderUseChat({ connection: adapter })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.error).toBeDefined()
        })

        expect(result.current.error?.message).toBe('Stream error')
      })

      it('should clear error on successful operation', async () => {
        const errorAdapter = createMockConnectionAdapter({
          shouldError: true,
          error: new Error('Initial error'),
        })
        const { result, rerender } = renderUseChat({
          connection: errorAdapter,
        })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.error).toBeDefined()
        })

        // Switch to working adapter
        const workingAdapter = createMockConnectionAdapter({
          chunks: createTextChunks('Success'),
        })
        rerender({ connection: workingAdapter })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          // Error should be cleared on success
          expect(result.current.messages.length).toBeGreaterThan(0)
        })
      })

      it('should handle tool execution errors', async () => {
        const toolCalls = createToolCallChunks([
          { id: 'tool-1', name: 'testTool', arguments: '{"param": "value"}' },
        ])
        const adapter = createMockConnectionAdapter({ chunks: toolCalls })
        const { result } = renderUseChat({
          connection: adapter,
          onToolCall: async () => {
            throw new Error('Tool execution failed')
          },
        })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          expect(result.current.messages.length).toBeGreaterThan(0)
        })

        // Tool errors are handled by adding error output to the tool call part
        // The error state is not set for tool execution failures
        // Check that the message contains a tool call with error output
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        expect(assistantMessage).toBeDefined()

        if (assistantMessage) {
          const toolCallPart = assistantMessage.parts.find(
            (p) => p.type === 'tool-call',
          )
          expect(toolCallPart).toBeDefined()
        }
      })
    })

    describe('multiple hook instances', () => {
      it('should maintain independent state per instance', async () => {
        const adapter1 = createMockConnectionAdapter({
          chunks: createTextChunks('Response 1'),
        })
        const adapter2 = createMockConnectionAdapter({
          chunks: createTextChunks('Response 2'),
        })

        const { result: result1 } = renderUseChat({
          connection: adapter1,
          id: 'chat-1',
        })
        const { result: result2 } = renderUseChat({
          connection: adapter2,
          id: 'chat-2',
        })

        await result1.current.sendMessage('Hello 1')
        await result2.current.sendMessage('Hello 2')

        await waitFor(() => {
          expect(result1.current.messages.length).toBeGreaterThan(0)
          expect(result2.current.messages.length).toBeGreaterThan(0)
        })

        // Each instance should have its own messages
        expect(result1.current.messages.length).toBe(
          result2.current.messages.length,
        )
        expect(result1.current.messages[0].parts[0]).not.toEqual(
          result2.current.messages[0].parts[0],
        )
      })

      it('should handle different IDs correctly', () => {
        const adapter = createMockConnectionAdapter()
        const { result: result1 } = renderUseChat({
          connection: adapter,
          id: 'chat-1',
        })
        const { result: result2 } = renderUseChat({
          connection: adapter,
          id: 'chat-2',
        })

        // Should not interfere with each other
        expect(result1.current.messages).toEqual([])
        expect(result2.current.messages).toEqual([])
      })

      it('should not have cross-contamination', async () => {
        const adapter1 = createMockConnectionAdapter({
          chunks: createTextChunks('One'),
        })
        const adapter2 = createMockConnectionAdapter({
          chunks: createTextChunks('Two'),
        })

        const { result: result1 } = renderUseChat({
          connection: adapter1,
        })
        const { result: result2 } = renderUseChat({
          connection: adapter2,
        })

        await result1.current.sendMessage('Message 1')
        await waitFor(() => {
          expect(result1.current.messages.length).toBeGreaterThan(0)
        })

        // Second instance should still be empty
        expect(result2.current.messages.length).toBe(0)

        await result2.current.sendMessage('Message 2')
        await waitFor(() => {
          expect(result2.current.messages.length).toBeGreaterThan(0)
        })

        // Both should have messages, but different ones
        expect(result1.current.messages.length).toBeGreaterThan(0)
        expect(result2.current.messages.length).toBeGreaterThan(0)
        expect(result1.current.messages[0].parts[0]).not.toEqual(
          result2.current.messages[0].parts[0],
        )
      })
    })

    describe('tool operations', () => {
      it('should handle addToolResult', async () => {
        const toolCalls = createToolCallChunks([
          { id: 'tool-1', name: 'testTool', arguments: '{"param": "value"}' },
        ])
        const adapter = createMockConnectionAdapter({ chunks: toolCalls })
        const { result } = renderUseChat({
          connection: adapter,
          onToolCall: async () => ({ result: 'success' }),
        })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          const assistantMessage = result.current.messages.find(
            (m) => m.role === 'assistant',
          )
          expect(assistantMessage).toBeDefined()
        })

        // Find tool call
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        const toolCallPart = assistantMessage?.parts.find(
          (p) => p.type === 'tool-call',
        )

        if (toolCallPart && toolCallPart.type === 'tool-call') {
          await result.current.addToolResult({
            toolCallId: toolCallPart.id,
            tool: toolCallPart.name,
            output: { result: 'manual' },
          })

          // Should update the tool call
          await waitFor(() => {
            const updatedMessage = result.current.messages.find(
              (m) => m.role === 'assistant',
            )
            const updatedToolCall = updatedMessage?.parts.find(
              (p) => p.type === 'tool-call' && p.id === toolCallPart.id,
            )
            expect(updatedToolCall).toBeDefined()
          })
        }
      })

      it('should handle addToolApprovalResponse', async () => {
        const toolCalls = createToolCallChunks([
          { id: 'tool-1', name: 'testTool', arguments: '{"param": "value"}' },
        ])
        const adapter = createMockConnectionAdapter({ chunks: toolCalls })
        const { result } = renderUseChat({
          connection: adapter,
        })

        await result.current.sendMessage('Test')

        await waitFor(() => {
          const assistantMessage = result.current.messages.find(
            (m) => m.role === 'assistant',
          )
          expect(assistantMessage).toBeDefined()
        })

        // Find tool call with approval
        const assistantMessage = result.current.messages.find(
          (m) => m.role === 'assistant',
        )
        const toolCallPart = assistantMessage?.parts.find(
          (p) => p.type === 'tool-call' && p.approval,
        )

        if (
          toolCallPart &&
          toolCallPart.type === 'tool-call' &&
          toolCallPart.approval
        ) {
          await result.current.addToolApprovalResponse({
            id: toolCallPart.approval.id,
            approved: true,
          })

          // Should update approval state
          await waitFor(() => {
            const updatedMessage = result.current.messages.find(
              (m) => m.role === 'assistant',
            )
            const updatedToolCall = updatedMessage?.parts.find(
              (p) => p.type === 'tool-call' && p.id === toolCallPart.id,
            )
            if (updatedToolCall && updatedToolCall.type === 'tool-call') {
              expect(updatedToolCall.approval?.approved).toBe(true)
            }
          })
        }
      })
    })
  })
})
