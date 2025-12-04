import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/svelte'
import { useChat } from '../src/use-chat'
import { createMockConnection, createTextChunk } from './test-utils'

// Test component wrapper for Svelte 5
function createTestComponent(chatOptions: any) {
  let chatInstance: any

  const TestComponent = `
    <script>
      import { useChat } from '../src/use-chat'
      
      const chat = useChat(${JSON.stringify(chatOptions)})
      
      // Expose chat for testing
      if (typeof window !== 'undefined') {
        window.testChat = chat
      }
    </script>
    
    <div>
      <div data-testid="message-count">{chat.messages.length}</div>
      <div data-testid="is-loading">{chat.isLoading}</div>
      <div data-testid="error">{chat.error?.message || ''}</div>
    </div>
  `

  return TestComponent
}

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with empty messages', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(chat.messages).toEqual([])
    expect(chat.isLoading).toBe(false)
    expect(chat.error).toBeUndefined()
  })

  it('should initialize with initial messages', () => {
    const mockConnection = createMockConnection([])
    const initialMessages = [
      {
        id: '1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Hello' }],
        createdAt: new Date(),
      },
    ]

    const chat = useChat({
      connection: mockConnection,
      initialMessages,
    })

    expect(chat.messages).toHaveLength(1)
    expect(chat.messages[0].role).toBe('user')
  })

  it('should have sendMessage method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.sendMessage).toBe('function')
  })

  it('should have stop method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.stop).toBe('function')
    chat.stop() // Should not throw
  })

  it('should have clear method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.clear).toBe('function')
    chat.clear() // Should not throw
  })

  it('should have reload method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.reload).toBe('function')
  })

  it('should have setMessages method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.setMessages).toBe('function')
  })

  it('should have addToolResult method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.addToolResult).toBe('function')
  })

  it('should have addToolApprovalResponse method', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    expect(typeof chat.addToolApprovalResponse).toBe('function')
  })

  it('should expose reactive messages property', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    // Access messages multiple times
    expect(chat.messages).toEqual([])
    expect(chat.messages).toEqual([])
  })

  it('should expose reactive isLoading property', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    // Access isLoading multiple times
    expect(chat.isLoading).toBe(false)
    expect(chat.isLoading).toBe(false)
  })

  it('should expose reactive error property', () => {
    const mockConnection = createMockConnection([])

    const chat = useChat({
      connection: mockConnection,
    })

    // Access error multiple times
    expect(chat.error).toBeUndefined()
    expect(chat.error).toBeUndefined()
  })
})

