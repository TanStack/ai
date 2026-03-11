/**
 * Mock Text Adapter for deterministic testing
 *
 * This adapter returns predetermined responses based on a response sequence,
 * allowing for fully deterministic testing of the skills system.
 */

import type {
  ContentStreamChunk,
  DefaultMessageMetadataByModality,
  DoneStreamChunk,
  StreamChunk,
  ToolCallStreamChunk,
} from '@tanstack/ai'

/**
 * A predetermined response that the mock adapter will return
 */
export interface MockResponse {
  /**
   * Text content to stream (optional)
   */
  content?: string

  /**
   * Tool calls to make (optional)
   */
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

/**
 * Configuration for the mock adapter
 */
export interface MockAdapterConfig {
  /**
   * Sequence of responses to return.
   * The adapter will return responses in order, cycling back to the start if needed.
   */
  responses: Array<MockResponse>

  /**
   * Optional callback when a response is used
   */
  onResponse?: (index: number, response: MockResponse) => void
}

/**
 * Create a mock text adapter for testing
 */
export function createMockTextAdapter(config: MockAdapterConfig) {
  let responseIndex = 0

  const adapter = {
    kind: 'text' as const,
    name: 'mock',
    model: 'mock-model',

    // Type-only property for compatibility
    '~types': {} as {
      providerOptions: Record<string, unknown>
      inputModalities: readonly ['text']
      messageMetadataByModality: DefaultMessageMetadataByModality
    },

    async *chatStream(): AsyncIterable<StreamChunk> {
      const response = config.responses[responseIndex % config.responses.length]
      if (!response) {
        throw new Error('No responses configured for mock adapter')
      }

      config.onResponse?.(responseIndex, response)
      responseIndex++

      const timestamp = Date.now()
      const id = `mock-${timestamp}`

      // Yield tool calls first if present
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (let i = 0; i < response.toolCalls.length; i++) {
          const toolCall = response.toolCalls[i]!
          const toolCallChunk: ToolCallStreamChunk = {
            type: 'tool_call',
            id,
            model: 'mock-model',
            timestamp,
            index: i,
            toolCall: {
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            },
          }
          yield toolCallChunk
        }

        // Done with tool_calls finish reason
        const doneChunk: DoneStreamChunk = {
          type: 'done',
          id,
          model: 'mock-model',
          timestamp,
          finishReason: 'tool_calls',
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        }
        yield doneChunk
        return
      }

      // Stream content if present
      if (response.content) {
        // Stream content character by character for realistic simulation
        let accumulated = ''
        for (const char of response.content) {
          accumulated += char
          const contentChunk: ContentStreamChunk = {
            type: 'content',
            id,
            model: 'mock-model',
            timestamp,
            delta: char,
            content: accumulated,
            role: 'assistant',
          }
          yield contentChunk
        }
      }

      // Done chunk
      const doneChunk: DoneStreamChunk = {
        type: 'done',
        id,
        model: 'mock-model',
        timestamp,
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: response.content?.length || 0,
          totalTokens: 10 + (response.content?.length || 0),
        },
      }
      yield doneChunk
    },

    async structuredOutput() {
      throw new Error('Mock adapter does not support structured output')
    },

    /**
     * Reset the response index to start from the beginning
     */
    reset() {
      responseIndex = 0
    },

    /**
     * Get the current response index
     */
    getResponseIndex() {
      return responseIndex
    },

    /**
     * Set the response index to a specific value
     */
    setResponseIndex(index: number) {
      responseIndex = index
    },
  }

  return adapter
}

/**
 * Helper to create a text-only response
 */
export function textResponse(content: string): MockResponse {
  return { content }
}

/**
 * Helper to create a tool call response
 */
export function toolCallResponse(
  toolCalls: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>,
): MockResponse {
  return { toolCalls }
}

/**
 * Helper to create a single tool call response
 */
export function singleToolCall(
  name: string,
  args: Record<string, unknown>,
  id?: string,
): MockResponse {
  return {
    toolCalls: [
      {
        id: id || `call_${name}_${Date.now()}`,
        name,
        arguments: args,
      },
    ],
  }
}
