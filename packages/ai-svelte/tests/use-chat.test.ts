import { ChatClient } from '@tanstack/ai-client'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChat } from '../src/create-chat.svelte'
import {
  createInterruptResumeSnapshot,
  createMockConnectionAdapter,
  createTextChunks,
} from './test-utils'

describe('createChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('interrupt state', () => {
    it('projects one immutable reactive snapshot with the deprecated pending alias', async () => {
      const onInterruptStateChange = vi.fn()
      const chat = createChat({
        connection: createMockConnectionAdapter(),
        initialResumeSnapshot: createInterruptResumeSnapshot(),
        onInterruptStateChange,
      })

      expect(Object.isFrozen(chat.interrupts)).toBe(true)
      expect(chat.pendingInterrupts).toBe(chat.interrupts)
      expect(chat.interrupts[0]).toMatchObject({
        id: 'staged-interrupt',
        status: 'staged',
      })
      expect(chat.interrupts[1]).toMatchObject({
        id: 'invalid-interrupt',
        status: 'error',
        error: { code: 'invalid-payload' },
      })
      expect(chat.interruptErrors).toEqual([])
      expect(chat.resuming).toBe(false)
      expect(chat.interrupts[0]).toEqual(
        expect.objectContaining({
          resolveInterrupt: expect.any(Function),
          cancel: expect.any(Function),
          clearResolution: expect.any(Function),
        }),
      )

      chat.resolveInterrupts(false)
      await tick()
      expect(chat.interruptErrors[0]?.code).toBe('unsupported-bulk-operation')
      expect(onInterruptStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interrupts: chat.interrupts,
          interruptErrors: chat.interruptErrors,
        }),
      )
    })

    it('delegates every root interrupt control to ChatClient', async () => {
      const resolve = vi
        .spyOn(ChatClient.prototype, 'resolveInterrupts')
        .mockImplementation(() => {})
      const cancel = vi
        .spyOn(ChatClient.prototype, 'cancelInterrupts')
        .mockImplementation(() => {})
      const retry = vi
        .spyOn(ChatClient.prototype, 'retryInterrupts')
        .mockImplementation(() => {})
      const unsafe = vi
        .spyOn(ChatClient.prototype, 'resumeInterruptsUnsafe')
        .mockResolvedValue(true)
      const chat = createChat({ connection: createMockConnectionAdapter() })
      const resolver = () => undefined
      const resume = [{ interruptId: 'one', status: 'cancelled' as const }]

      chat.resolveInterrupts(resolver)
      chat.cancelInterrupts()
      chat.retryInterrupts()
      await expect(chat.resumeInterruptsUnsafe(resume)).resolves.toBe(true)

      expect(resolve).toHaveBeenCalledWith(resolver)
      expect(cancel).toHaveBeenCalledOnce()
      expect(retry).toHaveBeenCalledOnce()
      expect(unsafe).toHaveBeenCalledWith(resume, undefined)
    })
  })

  it('should initialize with empty messages', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(chat.messages).toEqual([])
    expect(chat.isLoading).toBe(false)
    expect(chat.error).toBeUndefined()
    expect(chat.status).toBe('ready')
    expect(chat.isSubscribed).toBe(false)
    expect(chat.connectionStatus).toBe('disconnected')
    expect(chat.sessionGenerating).toBe(false)
  })

  it('should subscribe immediately when live is true', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })
    const chat = createChat({
      connection: mockConnection,
      live: true,
    })

    expect(chat.isSubscribed).toBe(true)
    expect(['connecting', 'connected']).toContain(chat.connectionStatus)
  })

  it('should initialize with initial messages', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })
    const initialMessages = [
      {
        id: '1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Hello' }],
        createdAt: new Date(),
      },
    ]

    const chat = createChat({
      connection: mockConnection,
      initialMessages,
    })

    expect(chat.messages).toHaveLength(1)
    expect(chat.messages[0]!.role).toBe('user')
  })

  it('should initialize with persisted messages', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })
    const persistedMessages = [
      {
        id: 'persisted-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Persisted' }],
        createdAt: new Date(),
      },
    ]
    const persistence = {
      getItem: vi.fn(() => persistedMessages),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    const chat = createChat({
      connection: mockConnection,
      id: 'persisted-chat',
      persistence: { client: persistence },
    })

    expect(chat.messages).toEqual(persistedMessages)
    expect(persistence.getItem).toHaveBeenCalledWith('persisted-chat')
  })

  it('should let persisted empty arrays override initial messages', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })
    const initialMessages = [
      {
        id: 'initial-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Initial' }],
        createdAt: new Date(),
      },
    ]
    const persistence = {
      getItem: vi.fn(() => []),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    const chat = createChat({
      connection: mockConnection,
      id: 'persisted-chat',
      initialMessages,
      persistence: { client: persistence },
    })

    expect(chat.messages).toEqual([])
    expect(persistence.getItem).toHaveBeenCalledWith('persisted-chat')
  })

  it('should have sendMessage method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.sendMessage).toBe('function')
  })

  it('should have stop method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.stop).toBe('function')
    chat.stop() // Should not throw
  })

  it('should have clear method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.clear).toBe('function')
    chat.clear() // Should not throw
  })

  it('should have reload method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.reload).toBe('function')
  })

  it('should have setMessages method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.setMessages).toBe('function')
  })

  it('should have addToolResult method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.addToolResult).toBe('function')
  })

  it('should have addToolApprovalResponse method', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    expect(typeof chat.addToolApprovalResponse).toBe('function')
  })

  it('should expose reactive messages property', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    // Access messages multiple times
    expect(chat.messages).toEqual([])
    expect(chat.messages).toEqual([])
  })

  it('should expose reactive isLoading property', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    // Access isLoading multiple times
    expect(chat.isLoading).toBe(false)
    expect(chat.isLoading).toBe(false)
  })

  it('should expose reactive error property', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    // Access error multiple times
    expect(chat.error).toBeUndefined()
    expect(chat.error).toBeUndefined()
  })

  it('should expose reactive status property', () => {
    const mockConnection = createMockConnectionAdapter({ chunks: [] })

    const chat = createChat({
      connection: mockConnection,
    })

    // Access status multiple times
    expect(chat.status).toBe('ready')
    expect(chat.status).toBe('ready')
  })

  describe('status transitions', () => {
    it('should transition through states during generation', async () => {
      const chunks = createTextChunks('Response')
      const mockConnection = createMockConnectionAdapter({
        chunks,
        chunkDelay: 20,
      })

      const chat = createChat({
        connection: mockConnection,
      })

      const promise = chat.sendMessage('Test')
      expect(chat.status).not.toBe('ready')
      expect(['submitted', 'streaming']).toContain(chat.status)

      await promise
      expect(chat.status).toBe('ready')
    })

    it('should transition to error on error', async () => {
      const mockConnection = createMockConnectionAdapter({
        shouldError: true,
        error: new Error('AI Error'),
      })

      const chat = createChat({
        connection: mockConnection,
      })

      await chat.sendMessage('Test')
      expect(chat.status).toBe('error')
    })

    it('should transition to ready after stop', async () => {
      const chunks = createTextChunks('Response')
      const mockConnection = createMockConnectionAdapter({
        chunks,
        chunkDelay: 50,
      })

      const chat = createChat({
        connection: mockConnection,
      })

      const promise = chat.sendMessage('Test')

      // Wait a bit for it to start
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(chat.status).not.toBe('ready')

      chat.stop()
      expect(chat.status).toBe('ready')

      await promise.catch(() => {})
    })
  })
})
