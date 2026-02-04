import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChat } from '../src/create-chat.svelte'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

describe('createChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(chat.messages[0].role).toBe('user')
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
