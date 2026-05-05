import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createThinkingChunks,
  createToolCallChunks,
  createApprovalToolCallChunks,
  createCustomEventChunks,
} from './test-utils'
import type {
  ConnectionAdapter,
  ConnectConnectionAdapter,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '../src/types'

/** Cast an event object to StreamChunk for type compatibility with EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

describe('ChatClient', () => {
  describe('constructor', () => {
    it('should create a client with default options', () => {
      const adapter = createMockConnectionAdapter()
      const client = new ChatClient({ connection: adapter })

      expect(client.getMessages()).toEqual([])
      expect(client.getIsLoading()).toBe(false)
      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('disconnected')
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

    it('should throw if connection is not provided', () => {
      expect(() => new ChatClient({} as any)).toThrow(
        'Connection adapter is required',
      )
    })
  })

  describe('subscribe/send connection mode', () => {
    function createSubscribeAdapter(chunksToSend: Array<StreamChunk>) {
      let hasPendingSend = false
      let wakeSubscriber: (() => void) | null = null
      let removeAbortListener: (() => void) | null = null

      const subscribe = vi.fn((signal?: AbortSignal) => {
        return (async function* () {
          while (!signal?.aborted) {
            if (!hasPendingSend) {
              await new Promise<void>((resolve) => {
                removeAbortListener?.()
                removeAbortListener = null
                wakeSubscriber = resolve
                const onAbort = () => resolve()
                signal?.addEventListener('abort', onAbort, { once: true })
                removeAbortListener = () => {
                  signal?.removeEventListener('abort', onAbort)
                }
              })
              continue
            }

            hasPendingSend = false
            for (const chunk of chunksToSend) {
              yield chunk
            }
          }
          removeAbortListener?.()
          removeAbortListener = null
        })()
      })

      const send = vi.fn(async () => {
        removeAbortListener?.()
        removeAbortListener = null
        hasPendingSend = true
        wakeSubscriber?.()
        wakeSubscriber = null
      })

      return { subscribe, send }
    }

    it('should use subscribe/send adapter mode', async () => {
      const adapter = createSubscribeAdapter(
        createTextChunks('From subscribe/send mode'),
      )
      const client = new ChatClient({ connection: adapter })

      await client.sendMessage('Hello')

      expect(adapter.subscribe).toHaveBeenCalled()
      expect(adapter.send).toHaveBeenCalled()
    })

    it('stop should not unsubscribe an active subscription', async () => {
      const adapter = createSubscribeAdapter([
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as unknown as StreamChunk,
      ])
      const client = new ChatClient({ connection: adapter })

      client.subscribe()
      expect(client.getIsSubscribed()).toBe(true)
      expect(client.getConnectionStatus()).toBe('connecting')

      const sendPromise = client.sendMessage('Hello')
      client.stop()
      await sendPromise

      expect(client.getIsSubscribed()).toBe(true)
      client.unsubscribe()
      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('disconnected')
    })

    it('should re-subscribe on connection update when previously subscribed', () => {
      const adapter1 = createSubscribeAdapter([])
      const adapter2 = createSubscribeAdapter([])
      const client = new ChatClient({ connection: adapter1 })

      client.subscribe()
      expect(client.getIsSubscribed()).toBe(true)
      expect(adapter1.subscribe).toHaveBeenCalledTimes(1)

      client.updateOptions({ connection: adapter2 })

      expect(client.getIsSubscribed()).toBe(true)
      expect(adapter2.subscribe).toHaveBeenCalledTimes(1)
    })

    it('should emit subscription and connection lifecycle callbacks', async () => {
      const adapter = createSubscribeAdapter(createTextChunks('callback flow'))
      const subscriptionChanges: Array<boolean> = []
      const connectionStatuses: Array<string> = []
      const client = new ChatClient({
        connection: adapter,
        onSubscriptionChange: (isSubscribed) => {
          subscriptionChanges.push(isSubscribed)
        },
        onConnectionStatusChange: (status) => {
          connectionStatuses.push(status)
        },
      })

      client.subscribe()
      await client.sendMessage('Hello')
      client.unsubscribe()

      expect(subscriptionChanges).toEqual([true, false])
      expect(connectionStatuses[0]).toBe('connecting')
      expect(connectionStatuses).toContain('connected')
      expect(connectionStatuses[connectionStatuses.length - 1]).toBe(
        'disconnected',
      )
    })

    it('subscribe should be idempotent without restart', () => {
      const adapter = createSubscribeAdapter([])
      const client = new ChatClient({ connection: adapter })

      client.subscribe()
      client.subscribe()

      expect(adapter.subscribe).toHaveBeenCalledTimes(1)
      expect(client.getIsSubscribed()).toBe(true)

      client.unsubscribe()
    })

    it('subscribe with restart should start a new subscription loop', () => {
      const adapter = createSubscribeAdapter([])
      const client = new ChatClient({ connection: adapter })

      client.subscribe()
      client.subscribe({ restart: true })

      expect(adapter.subscribe).toHaveBeenCalledTimes(2)
      expect(client.getIsSubscribed()).toBe(true)
      expect(client.getConnectionStatus()).toBe('connecting')

      client.unsubscribe()
    })

    it('unsubscribe should be idempotent', () => {
      const adapter = createSubscribeAdapter([])
      const client = new ChatClient({ connection: adapter })

      client.unsubscribe()
      client.unsubscribe()

      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('disconnected')
    })

    it('unsubscribe should abort in-flight requests and disconnect', async () => {
      const adapter = createSubscribeAdapter([
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'H',
          content: 'H',
        } as unknown as StreamChunk,
      ])
      const client = new ChatClient({ connection: adapter })

      client.subscribe()
      const sendPromise = client.sendMessage('Hello')
      await new Promise((resolve) => setTimeout(resolve, 10))
      client.unsubscribe()

      const completed = await Promise.race([
        sendPromise.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 500),
        ),
      ])

      expect(completed).toBe(true)
      expect(client.getIsLoading()).toBe(false)
      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('disconnected')
    })

    it('should not re-subscribe on connection update when not subscribed', () => {
      const adapter1 = createSubscribeAdapter([])
      const adapter2 = createSubscribeAdapter([])
      const client = new ChatClient({ connection: adapter1 })

      client.updateOptions({ connection: adapter2 })

      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('disconnected')
      expect(adapter2.subscribe).not.toHaveBeenCalled()
    })

    it('should expose connectionStatus error for subscription loop failures', async () => {
      const connection = {
        subscribe: async function* () {
          throw new Error('subscription failed')
        },
        send: async () => {},
      }
      const client = new ChatClient({ connection })

      client.subscribe()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(client.getIsSubscribed()).toBe(false)
      expect(client.getConnectionStatus()).toBe('error')
    })

    it('should remain pending without terminal run events', async () => {
      const adapter = createSubscribeAdapter([
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'H',
          content: 'H',
        } as unknown as StreamChunk,
      ])
      const client = new ChatClient({ connection: adapter })

      const sendPromise = client.sendMessage('Hello')
      const completed = await Promise.race([
        sendPromise.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 100),
        ),
      ])

      expect(completed).toBe(false)

      // Explicitly stop to unblock the in-flight request.
      client.stop()
      await sendPromise
    })

    describe('sessionGenerating', () => {
      it('should be false initially', () => {
        const adapter = createSubscribeAdapter([])
        const client = new ChatClient({ connection: adapter })

        expect(client.getSessionGenerating()).toBe(false)
      })

      it('should flip to true on RUN_STARTED and false on RUN_FINISHED', async () => {
        const chunks: Array<StreamChunk> = [
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'msg-1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'Hi',
            content: 'Hi',
          } as unknown as StreamChunk,
          {
            type: 'RUN_FINISHED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            finishReason: 'stop',
          } as unknown as StreamChunk,
        ]
        const adapter = createSubscribeAdapter(chunks)
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection: adapter,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        await client.sendMessage('Hello')

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toEqual([true, false])
      })

      it('should flip to false on RUN_ERROR', async () => {
        const chunks: Array<StreamChunk> = [
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'RUN_ERROR',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            error: { message: 'something went wrong' },
          } as unknown as StreamChunk,
        ]
        const adapter = createSubscribeAdapter(chunks)
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection: adapter,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        await client.sendMessage('Hello')

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toEqual([true, false])
      })

      it('should remain correct through subscribe/unsubscribe cycles', async () => {
        const chunks: Array<StreamChunk> = [
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'msg-1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'Hi',
            content: 'Hi',
          } as unknown as StreamChunk,
          {
            type: 'RUN_FINISHED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            finishReason: 'stop',
          } as unknown as StreamChunk,
        ]
        const adapter = createSubscribeAdapter(chunks)
        const client = new ChatClient({ connection: adapter })

        // First cycle
        await client.sendMessage('Hello')
        expect(client.getSessionGenerating()).toBe(false)

        // Unsubscribe
        client.unsubscribe()
        expect(client.getSessionGenerating()).toBe(false)
      })

      it('should reset on unsubscribe while generating', async () => {
        let yieldedStart = false
        const connection = {
          subscribe: async function* (signal?: AbortSignal) {
            while (!signal?.aborted) {
              if (!yieldedStart) {
                yieldedStart = true
                yield asChunk({
                  type: 'RUN_STARTED' as const,
                  runId: 'run-1',
                  model: 'test',
                  timestamp: Date.now(),
                })
              }
              await new Promise<void>((resolve) => {
                const onAbort = () => resolve()
                signal?.addEventListener('abort', onAbort, { once: true })
              })
            }
          },
          send: async () => {
            // no-op; the subscribe generator yields RUN_STARTED on its own
          },
        }
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        client.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(true)

        client.unsubscribe()

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toEqual([true, false])
      })

      it('should reset on connection adapter replacement', async () => {
        let yieldedStart = false
        const connection1 = {
          subscribe: async function* (signal?: AbortSignal) {
            while (!signal?.aborted) {
              if (!yieldedStart) {
                yieldedStart = true
                yield asChunk({
                  type: 'RUN_STARTED' as const,
                  runId: 'run-1',
                  model: 'test',
                  timestamp: Date.now(),
                })
              }
              await new Promise<void>((resolve) => {
                const onAbort = () => resolve()
                signal?.addEventListener('abort', onAbort, { once: true })
              })
            }
          },
          send: async () => {},
        }
        const connection2 = createSubscribeAdapter([])
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection: connection1,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        client.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(client.getSessionGenerating()).toBe(true)

        client.updateOptions({ connection: connection2 })

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toEqual([true, false])

        client.unsubscribe()
      })

      it('should not emit duplicate callbacks on repeated same-state events', async () => {
        const chunks: Array<StreamChunk> = [
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'msg-1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'Hi',
            content: 'Hi',
          } as unknown as StreamChunk,
          {
            type: 'RUN_FINISHED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            finishReason: 'stop',
          } as unknown as StreamChunk,
          {
            type: 'RUN_FINISHED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            finishReason: 'stop',
          } as unknown as StreamChunk,
        ]
        const adapter = createSubscribeAdapter(chunks)
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection: adapter,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        await client.sendMessage('Hello')

        expect(generatingChanges).toEqual([true, false])
      })

      it('should handle interleaved multi-run events from durable subscription', async () => {
        const chunks: Array<StreamChunk> = [
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'msg-1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'A',
            content: 'A',
          } as unknown as StreamChunk,
          {
            type: 'RUN_FINISHED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
            finishReason: 'stop',
          } as unknown as StreamChunk,
        ]
        const adapter = createSubscribeAdapter(chunks)
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection: adapter,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        await client.sendMessage('First')
        expect(generatingChanges).toEqual([true, false])

        await client.sendMessage('Second')
        expect(generatingChanges).toEqual([true, false, true, false])
      })

      it('should stay true during concurrent runs until all finish', async () => {
        const wake = { fn: null as (() => void) | null }
        const chunks: Array<StreamChunk> = []
        const connection = {
          subscribe: async function* (signal?: AbortSignal) {
            while (!signal?.aborted) {
              if (chunks.length > 0) {
                const batch = chunks.splice(0)
                for (const chunk of batch) {
                  yield chunk
                }
              }
              await new Promise<void>((resolve) => {
                wake.fn = resolve
                const onAbort = () => resolve()
                signal?.addEventListener('abort', onAbort, { once: true })
              })
            }
          },
          send: async () => {
            wake.fn?.()
          },
        }
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        client.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Simulate two concurrent runs starting
        chunks.push(
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'RUN_STARTED',
            runId: 'run-2',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
        )
        wake.fn?.()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(true)

        // First run finishes — should still be generating because run-2 is active
        chunks.push({
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as unknown as StreamChunk)
        wake.fn?.()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(true)

        // Second run finishes — now should be false
        chunks.push({
          type: 'RUN_FINISHED',
          runId: 'run-2',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as unknown as StreamChunk)
        wake.fn?.()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(false)
        // Only two transitions: false→true at start, true→false when all done
        expect(generatingChanges).toEqual([true, false])

        client.unsubscribe()
      })

      it('should clear all runs on RUN_ERROR without runId', async () => {
        const wake = { fn: null as (() => void) | null }
        const chunks: Array<StreamChunk> = []
        const connection = {
          subscribe: async function* (signal?: AbortSignal) {
            while (!signal?.aborted) {
              if (chunks.length > 0) {
                const batch = chunks.splice(0)
                for (const chunk of batch) {
                  yield chunk
                }
              }
              await new Promise<void>((resolve) => {
                wake.fn = resolve
                const onAbort = () => resolve()
                signal?.addEventListener('abort', onAbort, { once: true })
              })
            }
          },
          send: async () => {
            wake.fn?.()
          },
        }
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        client.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Two runs active
        chunks.push(
          {
            type: 'RUN_STARTED',
            runId: 'run-1',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
          {
            type: 'RUN_STARTED',
            runId: 'run-2',
            model: 'test',
            timestamp: Date.now(),
          } as unknown as StreamChunk,
        )
        wake.fn?.()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(true)

        // Session-level error without runId clears everything
        chunks.push({
          type: 'RUN_ERROR',
          model: 'test',
          timestamp: Date.now(),
          error: { message: 'session crashed' },
        } as unknown as StreamChunk)
        wake.fn?.()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toEqual([true, false])

        client.unsubscribe()
      })

      it('should reset on fatal subscription loop teardown', async () => {
        let yieldedStart = false
        const connection = {
          subscribe: async function* (_signal?: AbortSignal) {
            if (!yieldedStart) {
              yieldedStart = true
              yield asChunk({
                type: 'RUN_STARTED' as const,
                runId: 'run-1',
                model: 'test',
                timestamp: Date.now(),
              })
              await new Promise((resolve) => setTimeout(resolve, 10))
            }
            throw new Error('subscription failed')
          },
          send: async () => {},
        }
        const generatingChanges: Array<boolean> = []
        const client = new ChatClient({
          connection,
          onSessionGeneratingChange: (isGenerating) => {
            generatingChanges.push(isGenerating)
          },
        })

        client.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(client.getSessionGenerating()).toBe(false)
        expect(generatingChanges).toContain(true)
        expect(generatingChanges[generatingChanges.length - 1]).toBe(false)
      })
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

      expect(onError).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
      expect(onError.mock.calls[0]![0].message).toBe('Connection failed')
      expect(client.getError()).toBeInstanceOf(Error)
      expect(client.getError()?.message).toBe('Connection failed')
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

  describe('drain re-entrancy guard (fix #302)', () => {
    it('should continue after multiple client tools complete in the same round', async () => {
      // Round 1: two simultaneous tool calls (triggers the re-entrancy bug)
      const round1Chunks = createToolCallChunks([
        { id: 'tc-1', name: 'tool_one', arguments: '{}' },
        { id: 'tc-2', name: 'tool_two', arguments: '{}' },
      ])
      // Round 2: final text response
      const round2Chunks = createTextChunks('Done!', 'msg-2')

      let callIndex = 0
      const adapter: ConnectConnectionAdapter = {
        async *connect(_messages, _data, abortSignal) {
          callIndex++
          const chunks = callIndex === 1 ? round1Chunks : round2Chunks
          for (const chunk of chunks) {
            if (abortSignal?.aborted) return
            yield chunk
          }
        },
      }

      // Both tools execute immediately (synchronously resolve)
      const client = new ChatClient({
        connection: adapter,
        tools: [
          {
            __toolSide: 'client' as const,
            name: 'tool_one',
            description: 'Tool one',
            execute: async () => ({ result: 'one' }),
          },
          {
            __toolSide: 'client' as const,
            name: 'tool_two',
            description: 'Tool two',
            execute: async () => ({ result: 'two' }),
          },
        ],
      })

      // Send initial message — triggers round 1 (two tool calls, both auto-executed)
      await client.sendMessage('Run both tools')

      // Wait for loading to stop and the continuation (round 2) to complete
      await vi.waitFor(
        () => {
          expect(client.getIsLoading()).toBe(false)
          // Ensure round 2 actually fired
          expect(callIndex).toBeGreaterThanOrEqual(2)
        },
        { timeout: 2000 },
      )

      // The final response "Done!" should appear in messages
      const messages = client.getMessages()
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')
      const textPart = lastAssistant?.parts.find((p) => p.type === 'text')
      expect(textPart?.content).toBe('Done!')
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

      expect(client.getError()).toBeInstanceOf(Error)
      expect(client.getError()?.message).toBe('Network error')
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

    it('should not hang when connection is updated during an active stream', async () => {
      const noTerminalAdapter = createMockConnectionAdapter({
        chunks: [
          {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'msg-1',
            model: 'test',
            timestamp: Date.now(),
            delta: 'H',
            content: 'H',
          } as unknown as StreamChunk,
        ],
        chunkDelay: 50,
      })
      const replacementAdapter = createMockConnectionAdapter({
        chunks: createTextChunks('replacement'),
      })
      const client = new ChatClient({ connection: noTerminalAdapter })

      const sendPromise = client.sendMessage('Hello')
      await new Promise((resolve) => setTimeout(resolve, 10))
      client.updateOptions({ connection: replacementAdapter })

      const completed = await Promise.race([
        sendPromise.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 500),
        ),
      ])

      expect(completed).toBe(true)
      expect(client.getIsLoading()).toBe(false)
    })

    it('should surface subscription loop failures without hanging', async () => {
      const connection = {
        subscribe: async function* () {
          throw new Error('subscription exploded')
        },
        send: async () => {},
      }
      const onError = vi.fn()
      const client = new ChatClient({ connection, onError })

      await client.sendMessage('Hello')

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
      expect(onError.mock.calls[0]?.[0].message).toBe('subscription exploded')
      expect(client.getStatus()).toBe('error')
    })
  })

  describe('devtools events', () => {
    it('should emit text:message:created event when assistant message starts', async () => {
      const chunks = createTextChunks('Hello, world!')
      const adapter = createMockConnectionAdapter({ chunks })

      const { aiEventClient } = await import('@tanstack/ai-event-client')
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

      const { aiEventClient } = await import('@tanstack/ai-event-client')
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

      const { aiEventClient } = await import('@tanstack/ai-event-client')
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

      const { aiEventClient } = await import('@tanstack/ai-event-client')
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

      const { aiEventClient } = await import('@tanstack/ai-event-client')
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
        {
          name: 'progress-update',
          value: { progress: 50, step: 'processing' },
        },
        {
          name: 'tool-status',
          value: { toolCallId: 'tc-1', status: 'running' },
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
          value: {
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
        { name: 'some-event', value: { info: 'test' } },
      ])
      const adapter = createMockConnectionAdapter({ chunks })

      const client = new ChatClient({ connection: adapter })

      // Should not throw error when onCustomEvent is undefined
      await expect(client.sendMessage('Test')).resolves.not.toThrow()
    })

    it('should allow updating onCustomEvent via updateOptions', async () => {
      const chunks = createCustomEventChunks([
        { name: 'test-event', value: { value: 42 } },
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
        { name: 'step-1', value: { stage: 'init' } },
        { name: 'step-2', value: { stage: 'process', toolCallId: 'tc-1' } },
        { name: 'step-3', value: { stage: 'complete' } },
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
        { name: 'complex-data-event', value: complexEventData },
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

  describe('chained tool approvals', () => {
    it('should continue after second approval arrives during active continuation stream', async () => {
      let streamCount = 0
      let resolveStreamPause: (() => void) | null = null

      const adapter: ConnectionAdapter = {
        async *connect() {
          streamCount++

          if (streamCount === 1) {
            // First stream: tool call A needing approval
            const chunks = createApprovalToolCallChunks([
              {
                id: 'tc-1',
                name: 'dangerous_tool_1',
                arguments: '{}',
                approvalId: 'approval-1',
              },
            ])
            for (const chunk of chunks) yield chunk
          } else if (streamCount === 2) {
            // Second stream (after first approval): tool call B needing approval
            // Yield the tool call and approval request
            const preChunks: Array<StreamChunk> = [
              {
                type: 'TOOL_CALL_START',
                toolCallId: 'tc-2',
                toolName: 'dangerous_tool_2',
                model: 'test',
                timestamp: Date.now(),
                index: 0,
              } as unknown as StreamChunk,
              {
                type: 'TOOL_CALL_ARGS',
                toolCallId: 'tc-2',
                model: 'test',
                timestamp: Date.now(),
                delta: '{}',
              } as unknown as StreamChunk,
              {
                type: 'TOOL_CALL_END',
                toolCallId: 'tc-2',
                toolName: 'dangerous_tool_2',
                model: 'test',
                timestamp: Date.now(),
              } as unknown as StreamChunk,
              {
                type: 'CUSTOM',
                model: 'test',
                timestamp: Date.now(),
                name: 'approval-requested',
                value: {
                  toolCallId: 'tc-2',
                  toolName: 'dangerous_tool_2',
                  input: {},
                  approval: { id: 'approval-2', needsApproval: true },
                },
              } as unknown as StreamChunk,
            ]
            for (const chunk of preChunks) yield chunk

            // Pause stream so the test can approve tool B while stream is active
            await new Promise<void>((resolve) => {
              resolveStreamPause = resolve
            })

            yield asChunk({
              type: 'RUN_FINISHED' as const,
              runId: 'run-2',
              model: 'test',
              timestamp: Date.now(),
              finishReason: 'tool_calls' as const,
            })
          } else if (streamCount === 3) {
            // Third stream (after second approval): final text response
            const chunks = createTextChunks('All done!')
            for (const chunk of chunks) yield chunk
          }
        },
      }

      const client = new ChatClient({ connection: adapter })

      // Step 1: Send message. First stream produces tool A with approval.
      await client.sendMessage('Do something dangerous')
      expect(streamCount).toBe(1)

      // Step 2: Approve tool A. This triggers checkForContinuation → streamResponse (stream 2).
      // Don't await - we need to interact during the stream.
      const approvalPromise = client.addToolApprovalResponse({
        id: 'approval-1',
        approved: true,
      })

      // Wait for second stream to pause (approval-requested chunk already processed)
      await vi.waitFor(() => {
        expect(resolveStreamPause).not.toBeNull()
      })

      // Step 3: Approve tool B while second stream is still active (isLoading=true)
      expect(client.getIsLoading()).toBe(true)
      await client.addToolApprovalResponse({
        id: 'approval-2',
        approved: true,
      })

      // Resume the second stream
      resolveStreamPause!()

      // Wait for the full chain to complete
      await approvalPromise

      // Step 4: Verify all 3 streams fired (the second approval triggered stream 3)
      expect(streamCount).toBe(3)

      // Verify final text response is present
      const messages = client.getMessages()
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')
      const textPart = lastAssistant?.parts.find((p) => p.type === 'text')
      expect(textPart?.content).toBe('All done!')
    })
  })

  describe('concurrent runs and reconnect correctness', () => {
    it('concurrent runs should not produce duplicate messages or corrupt content', async () => {
      const wake = { fn: null as (() => void) | null }
      const chunks: Array<StreamChunk> = []
      const connection = {
        subscribe: async function* (signal?: AbortSignal) {
          while (!signal?.aborted) {
            if (chunks.length > 0) {
              const batch = chunks.splice(0)
              for (const chunk of batch) {
                yield chunk
              }
              // Re-check: new chunks may have been pushed while yielding
              // (the consumer's setTimeout(0) between chunks allows the test
              // to push more before we reach the await below)
              if (chunks.length > 0) continue
            }
            await new Promise<void>((resolve) => {
              wake.fn = resolve
              const onAbort = () => resolve()
              signal?.addEventListener('abort', onAbort, { once: true })
            })
          }
        },
        send: async () => {
          wake.fn?.()
        },
      }

      const messagesSnapshots: Array<Array<UIMessage>> = []
      const client = new ChatClient({
        connection,
        onMessagesChange: (msgs) => {
          messagesSnapshots.push(msgs.map((m) => ({ ...m })))
        },
      })

      client.subscribe()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Run A starts with text message
      chunks.push(
        {
          type: 'RUN_STARTED',
          runId: 'run-a',
          model: 'test',
          timestamp: Date.now(),
        } as unknown as StreamChunk,
        {
          type: 'TEXT_MESSAGE_START',
          messageId: 'msg-a',
          role: 'assistant',
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-a',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Story: ',
        } as StreamChunk,
      )
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Run B starts concurrently
      chunks.push(
        {
          type: 'RUN_STARTED',
          runId: 'run-b',
          model: 'test',
          timestamp: Date.now(),
        } as unknown as StreamChunk,
        {
          type: 'TEXT_MESSAGE_START',
          messageId: 'msg-b',
          role: 'assistant',
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-b',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hi!',
        } as StreamChunk,
      )
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Run B finishes — Run A should still be active
      chunks.push({
        type: 'RUN_FINISHED',
        runId: 'run-b',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as unknown as StreamChunk)
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Run A continues streaming
      chunks.push({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-a',
        model: 'test',
        timestamp: Date.now(),
        delta: 'once upon a time',
      } as StreamChunk)
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify msg-a still has correct content after run-b finished
      const messages = client.getMessages()
      const msgA = messages.find((m) => m.id === 'msg-a')
      const msgB = messages.find((m) => m.id === 'msg-b')

      expect(msgA).toBeDefined()
      expect(msgB).toBeDefined()
      expect(msgA!.parts[0]).toEqual({
        type: 'text',
        content: 'Story: once upon a time',
      })
      expect(msgB!.parts[0]).toEqual({ type: 'text', content: 'Hi!' })

      // No duplicate messages
      expect(messages.filter((m) => m.id === 'msg-a')).toHaveLength(1)
      expect(messages.filter((m) => m.id === 'msg-b')).toHaveLength(1)

      // Finish run A
      chunks.push({
        type: 'RUN_FINISHED',
        runId: 'run-a',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as unknown as StreamChunk)
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(client.getSessionGenerating()).toBe(false)
      client.unsubscribe()
    })

    it('reconnect with initialMessages should not duplicate assistant message on content arrival', async () => {
      const wake = { fn: null as (() => void) | null }
      const chunks: Array<StreamChunk> = []
      const connection = {
        subscribe: async function* (signal?: AbortSignal) {
          while (!signal?.aborted) {
            if (chunks.length > 0) {
              const batch = chunks.splice(0)
              for (const chunk of batch) {
                yield chunk
              }
              if (chunks.length > 0) continue
            }
            await new Promise<void>((resolve) => {
              wake.fn = resolve
              const onAbort = () => resolve()
              signal?.addEventListener('abort', onAbort, { once: true })
            })
          }
        },
        send: async () => {
          wake.fn?.()
        },
      }

      // Simulate reconnect: client created with initialMessages (from SSR/snapshot)
      const initialMessages: Array<UIMessage> = [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Tell me a story' }],
          createdAt: new Date(),
        },
        {
          id: 'asst-1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Once upon a ' }],
          createdAt: new Date(),
        },
      ]

      const client = new ChatClient({
        connection,
        initialMessages,
      })

      client.subscribe()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Resumed content for in-progress message (no TEXT_MESSAGE_START)
      chunks.push(
        {
          type: 'RUN_STARTED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
        } as unknown as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'asst-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'time...',
        } as StreamChunk,
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as unknown as StreamChunk,
      )
      wake.fn?.()
      await new Promise((resolve) => setTimeout(resolve, 20))

      const messages = client.getMessages()

      // Should still have exactly 2 messages, not 3
      expect(messages).toHaveLength(2)

      // Content should be correctly appended
      const asstMsg = messages.find((m) => m.id === 'asst-1')
      expect(asstMsg).toBeDefined()
      expect(asstMsg!.parts[0]).toEqual({
        type: 'text',
        content: 'Once upon a time...',
      })

      client.unsubscribe()
    })
  })
})
