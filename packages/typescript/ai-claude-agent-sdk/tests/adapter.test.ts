import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeAgentSdk, claudeAgentSdk, createClaudeAgentSdk } from '../src/claude-agent-sdk-adapter'
import { CLAUDE_AGENT_SDK_MODELS } from '../src/model-meta'
import type { StreamChunk } from '@tanstack/ai'

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'

const mockQuery = vi.mocked(query)

describe('ClaudeAgentSdk Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // T012: Unit test for adapter instantiation
  describe('instantiation', () => {
    it('should create adapter with default configuration', () => {
      const adapter = claudeAgentSdk()

      expect(adapter).toBeInstanceOf(ClaudeAgentSdk)
      expect(adapter.name).toBe('claude-agent-sdk')
      expect(adapter.models).toEqual(CLAUDE_AGENT_SDK_MODELS)
    })

    it('should create adapter with custom model via createClaudeAgentSdk', () => {
      const adapter = createClaudeAgentSdk({ model: 'claude-opus-4-5' })

      expect(adapter).toBeInstanceOf(ClaudeAgentSdk)
      expect(adapter.name).toBe('claude-agent-sdk')
    })

    it('should expose correct model list', () => {
      const adapter = claudeAgentSdk()

      // Claude Agent SDK uses short model names: 'haiku', 'sonnet', 'opus'
      expect(adapter.models).toContain('haiku')
      expect(adapter.models).toContain('sonnet')
      expect(adapter.models).toContain('opus')
      expect(adapter.models).toHaveLength(3)
    })
  })

  // T013: Unit test for chatStream() basic text generation
  describe('chatStream - basic text generation', () => {
    it('should stream text content from simple prompt', async () => {
      // Mock SDK response stream
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Hello! How can I help you today?'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
      })) {
        chunks.push(chunk)
      }

      // Should have content and done chunks
      expect(chunks.some((c) => c.type === 'content')).toBe(true)
      expect(chunks.some((c) => c.type === 'done')).toBe(true)

      // Verify content
      const contentChunk = chunks.find((c) => c.type === 'content')
      expect(contentChunk).toBeDefined()
      if (contentChunk?.type === 'content') {
        expect(contentChunk.content).toBe('Hello! How can I help you today?')
        expect(contentChunk.role).toBe('assistant')
      }
    })

    it('should call SDK query with correct parameters', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Response'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      // Consume the stream
      for await (const _ of adapter.chatStream({
        model: 'claude-opus-4-5',
        messages: [{ role: 'user', content: 'Test prompt' }],
      })) {
        // consume
      }

      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Test prompt'),
          options: expect.objectContaining({
            model: 'claude-opus-4-5',
            tools: [],
          }),
        }),
      )
    })

    it('should use default model when not specified', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Response'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      for await (const _ of adapter.chatStream({
        model: '',
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        // consume
      }

      // Should default to sonnet
      const chunks: StreamChunk[] = []
      const mockStream2 = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Response'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream2)

      for await (const chunk of adapter.chatStream({
        model: '',
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk)
      }

      const doneChunk = chunks.find((c) => c.type === 'done')
      expect(doneChunk?.model).toBe('sonnet')
    })
  })

  // T014: Unit test for streaming content chunks
  describe('chatStream - streaming chunks', () => {
    it('should yield streaming content chunks', async () => {
      // Mock streaming partial messages
      const mockStream = createMockStream([
        createSystemMessage(),
        createPartialMessage('text_delta', 'Hello'),
        createPartialMessage('text_delta', ' World'),
        createPartialMessage('text_delta', '!'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const contentChunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        if (chunk.type === 'content') {
          contentChunks.push(chunk)
        }
      }

      expect(contentChunks.length).toBe(3)

      // Check accumulated content
      if (contentChunks[0].type === 'content') {
        expect(contentChunks[0].delta).toBe('Hello')
        expect(contentChunks[0].content).toBe('Hello')
      }
      if (contentChunks[1].type === 'content') {
        expect(contentChunks[1].delta).toBe(' World')
        expect(contentChunks[1].content).toBe('Hello World')
      }
      if (contentChunks[2].type === 'content') {
        expect(contentChunks[2].delta).toBe('!')
        expect(contentChunks[2].content).toBe('Hello World!')
      }
    })

    it('should include timestamp and model in all chunks', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Test'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk)
      }

      for (const chunk of chunks) {
        expect(chunk.model).toBe('sonnet')
        expect(chunk.timestamp).toBeTypeOf('number')
        expect(chunk.id).toBeTypeOf('string')
        expect(chunk.id.startsWith('claude-agent-sdk-')).toBe(true)
      }
    })
  })

  // T15: Unit test for error chunk emission
  describe('chatStream - error handling', () => {
    it('should emit error chunk on SDK error', async () => {
      const error = new Error('Authentication failed')
      ;(error as any).code = 'authentication_error'
      mockQuery.mockImplementation(() => {
        throw error
      })

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk)
      }

      expect(chunks.length).toBe(1)
      expect(chunks[0].type).toBe('error')
      if (chunks[0].type === 'error') {
        expect(chunks[0].error.message).toBe('Authentication failed')
        expect(chunks[0].error.code).toBe('auth_error')
      }
    })

    it('should emit error chunk for result errors', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createResultMessage('error_max_turns', ['Max turns exceeded']),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk)
      }

      const errorChunk = chunks.find((c) => c.type === 'error')
      expect(errorChunk).toBeDefined()
      if (errorChunk?.type === 'error') {
        expect(errorChunk.error.message).toContain('Max turns exceeded')
        expect(errorChunk.error.code).toBe('error_max_turns')
      }
    })

    it('should map rate limit errors correctly', async () => {
      const error = new Error('Rate limited')
      ;(error as any).status = 429
      mockQuery.mockImplementation(() => {
        throw error
      })

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk)
      }

      expect(chunks[0].type).toBe('error')
      if (chunks[0].type === 'error') {
        expect(chunks[0].error.code).toBe('rate_limit')
      }
    })
  })

  // T22: Unit test for summarize() method
  describe('summarize', () => {
    it('should summarize text using chat', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('This is a summary of the text.'),
        createResultMessage('success', undefined, { input_tokens: 100, output_tokens: 20 }),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const result = await adapter.summarize({
        model: 'sonnet',
        text: 'This is a long text that needs to be summarized...',
      })

      expect(result.summary).toBe('This is a summary of the text.')
      expect(result.model).toBe('sonnet')
      expect(result.id).toBeTypeOf('string')
    })

    it('should support different summary styles', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('- Point 1\n- Point 2'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      await adapter.summarize({
        model: 'sonnet',
        text: 'Text to summarize',
        style: 'bullet-points',
      })

      // Verify the query was called with system prompt mentioning bullet points
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.any(String),
        }),
      )
    })
  })

  // T23: Unit test for createEmbeddings() throwing error
  describe('createEmbeddings', () => {
    it('should throw not supported error', () => {
      const adapter = claudeAgentSdk()

      expect(() =>
        adapter.createEmbeddings({
          model: 'text-embedding-ada-002',
          input: 'test',
        }),
      ).toThrow('Embeddings are not supported by Claude Agent SDK')
    })
  })

  // T025: Unit test for tool_call StreamChunk emission
  describe('chatStream - tool calls', () => {
    it('should emit tool_call chunks for tool use', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessageWithToolUse('get_weather', 'tool-123', { location: 'San Francisco' }),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
      })) {
        chunks.push(chunk)
      }

      const toolCallChunk = chunks.find((c) => c.type === 'tool_call')
      expect(toolCallChunk).toBeDefined()
      if (toolCallChunk?.type === 'tool_call') {
        expect(toolCallChunk.toolCall.function.name).toBe('get_weather')
        expect(toolCallChunk.toolCall.id).toBe('tool-123')
        expect(JSON.parse(toolCallChunk.toolCall.function.arguments)).toEqual({ location: 'San Francisco' })
      }
    })

    it('should set finishReason to tool_calls when tools are used', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessageWithToolUse('calculator', 'tool-456', { expression: '2+2' }),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Calculate 2+2' }],
      })) {
        chunks.push(chunk)
      }

      const doneChunk = chunks.find((c) => c.type === 'done')
      expect(doneChunk).toBeDefined()
      if (doneChunk?.type === 'done') {
        expect(doneChunk.finishReason).toBe('tool_calls')
      }
    })

    it('should handle multiple tool calls in one response', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessageWithMultipleToolUse([
          { name: 'tool1', id: 'id-1', input: { a: 1 } },
          { name: 'tool2', id: 'id-2', input: { b: 2 } },
        ]),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const toolCallChunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Use both tools' }],
      })) {
        if (chunk.type === 'tool_call') {
          toolCallChunks.push(chunk)
        }
      }

      expect(toolCallChunks.length).toBe(2)
    })
  })

  // T026: Unit test for tool result message formatting
  describe('chatStream - tool results', () => {
    it('should handle tool result messages in conversation', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('The weather in San Francisco is sunny.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      // Include a tool result in the messages
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{
              id: 'tool-123',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location":"SF"}' },
            }],
          },
          {
            role: 'tool',
            toolCallId: 'tool-123',
            content: '{"temperature": 72, "condition": "sunny"}',
          },
        ],
      })) {
        chunks.push(chunk)
      }

      // Verify the query was called with the tool result included
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('tool-123'),
        }),
      )
    })
  })

  // T043: Unit test for thinking StreamChunk emission
  describe('chatStream - extended thinking', () => {
    it('should emit thinking chunks when thinking is enabled', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createPartialMessage('thinking_delta', 'Let me think about this...'),
        createPartialMessage('thinking_delta', ' First, I need to consider...'),
        createAssistantMessage('Here is my answer.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const thinkingChunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'What is the meaning of life?' }],
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 5000,
          },
        },
      })) {
        if (chunk.type === 'thinking') {
          thinkingChunks.push(chunk)
        }
      }

      expect(thinkingChunks.length).toBe(2)
      if (thinkingChunks[0].type === 'thinking') {
        expect(thinkingChunks[0].delta).toBe('Let me think about this...')
        expect(thinkingChunks[0].content).toBe('Let me think about this...')
      }
      if (thinkingChunks[1].type === 'thinking') {
        expect(thinkingChunks[1].delta).toBe(' First, I need to consider...')
        expect(thinkingChunks[1].content).toBe('Let me think about this... First, I need to consider...')
      }
    })

    // T044: Unit test for thinking + content chunk ordering
    it('should emit thinking chunks before content chunks', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createPartialMessage('thinking_delta', 'Thinking...'),
        createPartialMessage('text_delta', 'Response text'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Complex question' }],
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 5000,
          },
        },
      })) {
        if (chunk.type === 'thinking' || chunk.type === 'content') {
          chunks.push(chunk)
        }
      }

      // Find the index of the first thinking and content chunks
      const firstThinkingIndex = chunks.findIndex((c) => c.type === 'thinking')
      const firstContentIndex = chunks.findIndex((c) => c.type === 'content')

      expect(firstThinkingIndex).toBeLessThan(firstContentIndex)
    })

    it('should pass maxThinkingTokens to SDK when thinking is enabled', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Response'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      for await (const _ of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Think deeply about this' }],
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 10000,
          },
        },
      })) {
        // consume
      }

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            maxThinkingTokens: 10000,
          }),
        }),
      )
    })

    // T045: Unit test for thinking token usage in done chunk
    it('should include usage stats in done chunk', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createPartialMessage('thinking_delta', 'Thinking...'),
        createAssistantMessage('Response'),
        createResultMessage('success', undefined, { input_tokens: 100, output_tokens: 500 }),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      let doneChunk: StreamChunk | undefined

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Complex reasoning task' }],
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 5000,
          },
        },
      })) {
        if (chunk.type === 'done') {
          doneChunk = chunk
        }
      }

      expect(doneChunk).toBeDefined()
      if (doneChunk?.type === 'done') {
        expect(doneChunk.usage).toBeDefined()
        expect(doneChunk.usage?.promptTokens).toBe(100)
        expect(doneChunk.usage?.completionTokens).toBe(500)
        expect(doneChunk.usage?.totalTokens).toBe(600)
      }
    })

    it('should handle assistant message with thinking block', async () => {
      // Test for full thinking blocks in assistant messages
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessageWithThinking('Internal reasoning process', 'The final answer is 42.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()
      const chunks: StreamChunk[] = []

      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages: [{ role: 'user', content: 'What is the answer?' }],
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 5000,
          },
        },
      })) {
        chunks.push(chunk)
      }

      const thinkingChunk = chunks.find((c) => c.type === 'thinking')
      const contentChunk = chunks.find((c) => c.type === 'content')

      expect(thinkingChunk).toBeDefined()
      expect(contentChunk).toBeDefined()

      if (thinkingChunk?.type === 'thinking') {
        expect(thinkingChunk.content).toBe('Internal reasoning process')
      }
      if (contentChunk?.type === 'content') {
        expect(contentChunk.content).toBe('The final answer is 42.')
      }
    })
  })
})

// Helper functions to create mock SDK messages
function createMockStream(messages: any[]): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const msg of messages) {
        yield msg
      }
    },
  }
}

function createSystemMessage() {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'test-session',
    model: 'sonnet',
    tools: [],
    permissionMode: 'default',
  }
}

function createAssistantMessage(text: string) {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    message: {
      content: [{ type: 'text', text }],
    },
  }
}

function createPartialMessage(deltaType: string, content: string) {
  return {
    type: 'stream_event',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    event: {
      type: 'content_block_delta',
      delta:
        deltaType === 'text_delta'
          ? { type: 'text_delta', text: content }
          : deltaType === 'thinking_delta'
            ? { type: 'thinking_delta', thinking: content }
            : { type: deltaType, partial_json: content },
    },
  }
}

function createResultMessage(
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd',
  errors?: string[],
  usage?: { input_tokens?: number; output_tokens?: number },
) {
  if (subtype === 'success') {
    return {
      type: 'result',
      subtype: 'success',
      session_id: 'test-session',
      duration_ms: 1000,
      num_turns: 1,
      result: 'completed',
      total_cost_usd: 0.001,
      usage: usage || { input_tokens: 10, output_tokens: 20 },
    }
  }

  return {
    type: 'result',
    subtype,
    session_id: 'test-session',
    duration_ms: 1000,
    num_turns: 1,
    is_error: true,
    errors: errors || ['An error occurred'],
    total_cost_usd: 0.001,
    usage: usage || { input_tokens: 10, output_tokens: 0 },
  }
}

function createAssistantMessageWithToolUse(
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
) {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    message: {
      content: [
        {
          type: 'tool_use',
          id: toolId,
          name: toolName,
          input,
        },
      ],
    },
  }
}

function createAssistantMessageWithMultipleToolUse(
  tools: Array<{ name: string; id: string; input: Record<string, unknown> }>,
) {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    message: {
      content: tools.map((tool) => ({
        type: 'tool_use',
        id: tool.id,
        name: tool.name,
        input: tool.input,
      })),
    },
  }
}

function createAssistantMessageWithThinking(thinking: string, text: string) {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    message: {
      content: [
        { type: 'thinking', thinking },
        { type: 'text', text },
      ],
    },
  }
}
