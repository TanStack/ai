import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { z } from 'zod'
import {
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS,
} from '../src/model-meta'
import { openRouterSupportsCombinedToolsAndSchema } from '../src/internal/combined-tools-and-schema'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import { createOpenRouterText } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'

// Mock the SDK with a constructor function, not a class. A class field named
// `chat` collides with the `chat` import when vitest hoists this mock.
let mockChatSend = vi.fn()
let mockResponsesSend = vi.fn()

vi.mock('@openrouter/sdk', () => {
  function OpenRouter(this: {
    chat: { send: (...args: Array<unknown>) => unknown }
    beta: { responses: { send: (...args: Array<unknown>) => unknown } }
  }) {
    this.chat = {
      send: (...args: Array<unknown>) => mockChatSend(...args),
    }
    this.beta = {
      responses: {
        send: (...args: Array<unknown>) => mockResponsesSend(...args),
      },
    }
  }
  return { OpenRouter }
})

const AnswerSchema = z.object({ answer: z.string() })

const tools: Array<Tool> = [
  { name: 'lookup_weather', description: 'Return the forecast for a location' },
]

const testLogger = resolveDebugOption(false)

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next(): Promise<IteratorResult<T>> {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { done: true, value: undefined }
        },
      }
    },
  }
}

function setupChatStream(chunks: Array<Record<string, unknown>>) {
  mockChatSend = vi
    .fn()
    .mockImplementation((params: { chatRequest?: { stream?: boolean } }) => {
      if (params.chatRequest?.stream) {
        return Promise.resolve(createAsyncIterable(chunks))
      }
      return Promise.resolve({ choices: [{ message: { content: '' } }] })
    })
}

function setupResponsesStream(chunks: Array<Record<string, unknown>>) {
  mockResponsesSend = vi
    .fn()
    .mockImplementation(
      (params: { responsesRequest?: { stream?: boolean } }) => {
        if (params.responsesRequest?.stream) {
          return Promise.resolve(createAsyncIterable(chunks))
        }
        return Promise.resolve({ output: [] })
      },
    )
}

const jsonStopChunks = [
  {
    id: 'chatcmpl-1',
    model: 'openai/gpt-4o',
    choices: [{ delta: { content: '{"answer":"ok"}' }, finishReason: null }],
  },
  {
    id: 'chatcmpl-1',
    model: 'openai/gpt-4o',
    choices: [{ delta: {}, finishReason: 'stop' }],
    usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
  },
]

const responsesJsonChunks = [
  {
    type: 'response.created',
    sequenceNumber: 0,
    response: { model: 'openai/gpt-4o', output: [] },
  },
  {
    type: 'response.output_text.delta',
    sequenceNumber: 1,
    itemId: 'msg_1',
    outputIndex: 0,
    contentIndex: 0,
    delta: '{"answer":"ok"}',
  },
  {
    type: 'response.completed',
    sequenceNumber: 2,
    response: {
      model: 'openai/gpt-4o',
      output: [],
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
    },
  },
]

function readCompleteObject(chunks: Array<StreamChunk>): unknown {
  for (const chunk of chunks) {
    if (
      chunk.type === EventType.CUSTOM &&
      chunk.name === 'structured-output.complete' &&
      chunk.value &&
      typeof chunk.value === 'object' &&
      'object' in chunk.value
    ) {
      return chunk.value.object
    }
  }
  throw new Error('missing structured-output.complete')
}

describe('OpenRouter combined tools + outputSchema', () => {
  beforeEach(() => {
    mockChatSend = vi.fn()
    mockResponsesSend = vi.fn()
  })

  describe('supportsCombinedToolsAndSchema gate', () => {
    it('returns true for combined-capable upstream models', () => {
      expect(
        createOpenRouterText(
          'anthropic/claude-sonnet-4.5',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterText(
          'openai/gpt-4o',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterText(
          'x-ai/grok-4.3',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterText(
          'google/gemini-3.6-flash',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
    })

    it('returns false for upstream models the upstream gate excludes', () => {
      expect(
        createOpenRouterText(
          'anthropic/claude-opus-4.1',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
      expect(
        createOpenRouterText(
          'openai/gpt-4o-2024-05-13',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
      expect(
        createOpenRouterText(
          'openai/gpt-4o-mini-2024-07-18',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
    })

    it('mirrors the gate on the Responses adapter', () => {
      expect(
        createOpenRouterResponsesText(
          'openai/gpt-4o',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createOpenRouterResponsesText(
          'openai/gpt-4o-2024-05-13',
          'k',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
    })

    it('requires every OpenRouter fallback model to support combined mode', () => {
      const adapter = createOpenRouterText('openai/gpt-4o', 'k')

      expect(
        adapter.supportsCombinedToolsAndSchema({
          models: ['anthropic/claude-sonnet-4.5'],
        }),
      ).toBe(true)
      expect(
        adapter.supportsCombinedToolsAndSchema({
          models: ['openai/gpt-4o-2024-05-13'],
        }),
      ).toBe(false)
    })

    it('strips :variant suffixes on the model id and on fallback models', () => {
      expect(
        openRouterSupportsCombinedToolsAndSchema('openai/gpt-4o:nitro'),
      ).toBe(true)
      expect(
        openRouterSupportsCombinedToolsAndSchema('openai/gpt-4o', {
          models: ['openai/gpt-4o:nitro'],
        }),
      ).toBe(true)
      expect(
        openRouterSupportsCombinedToolsAndSchema('openai/gpt-4o', {
          models: ['openai/gpt-4o-2024-05-13:nitro'],
        }),
      ).toBe(false)
    })
  })

  describe('chat-completions request payload', () => {
    it('attaches responseFormat alongside tools on chatStream', async () => {
      setupChatStream(jsonStopChunks)
      const adapter = createOpenRouterText('openai/gpt-4o', 'k')

      for await (const _ of adapter.chatStream({
        logger: testLogger,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      })) {
        // drain
      }

      expect(mockChatSend).toHaveBeenCalledTimes(1)
      const params = mockChatSend.mock.calls[0]![0].chatRequest
      expect(params.tools?.length).toBeGreaterThan(0)
      expect(params.responseFormat).toEqual({
        type: 'json_schema',
        jsonSchema: {
          name: 'structured_output',
          schema: expect.any(Object),
          strict: true,
        },
      })
    })

    it('omits responseFormat for an unsupported model on the agent-loop call', async () => {
      setupChatStream(jsonStopChunks)
      const adapter = createOpenRouterText('anthropic/claude-opus-4.1', 'k')

      for await (const _ of chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: AnswerSchema,
        stream: true,
      })) {
        // drain
      }

      expect(mockChatSend.mock.calls.length).toBeGreaterThan(0)
      const first = mockChatSend.mock.calls[0]![0].chatRequest
      expect(first.tools).toBeDefined()
      expect(first.responseFormat).toBeUndefined()
    })

    it('omits responseFormat when any fallback model is unsupported', async () => {
      setupChatStream(jsonStopChunks)
      const adapter = createOpenRouterText('openai/gpt-4o', 'k')

      for await (const _ of adapter.chatStream({
        logger: testLogger,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
        modelOptions: { models: ['openai/gpt-4o-2024-05-13'] },
      })) {
        // drain
      }

      const params = mockChatSend.mock.calls[0]![0].chatRequest
      expect(params.responseFormat).toBeUndefined()
      expect(params.models).toEqual(['openai/gpt-4o-2024-05-13'])
      expect(params.tools).toBeDefined()
    })
  })

  describe('Responses request payload', () => {
    it('attaches text.format alongside tools on chatStream', async () => {
      setupResponsesStream(responsesJsonChunks)
      const adapter = createOpenRouterResponsesText('openai/gpt-4o', 'k')

      for await (const _ of adapter.chatStream({
        logger: testLogger,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      })) {
        // drain
      }

      expect(mockResponsesSend).toHaveBeenCalledTimes(1)
      const params = mockResponsesSend.mock.calls[0]![0].responsesRequest
      expect(params.tools).toBeDefined()
      expect(params.text).toEqual({
        format: {
          type: 'json_schema',
          name: 'structured_output',
          schema: expect.any(Object),
          strict: true,
        },
      })
    })

    it('preserves caller-supplied text.* fields when attaching the schema format', async () => {
      setupResponsesStream(responsesJsonChunks)
      const adapter = createOpenRouterResponsesText('openai/gpt-4o', 'k')

      for await (const _ of adapter.chatStream({
        logger: testLogger,
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
        modelOptions: { text: { verbosity: 'low' } },
      })) {
        // drain
      }

      const params = mockResponsesSend.mock.calls[0]![0].responsesRequest
      expect(params.text?.verbosity).toBe('low')
      expect(params.text?.format).toMatchObject({
        type: 'json_schema',
        name: 'structured_output',
        strict: true,
      })
    })
  })

  describe('engine harvest', () => {
    it('parses final-turn JSON from chat({ tools, outputSchema, stream: true }) in one request', async () => {
      setupChatStream(jsonStopChunks)
      const adapter = createOpenRouterText('openai/gpt-4o', 'k')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: AnswerSchema,
        stream: true,
      })) {
        chunks.push(chunk)
      }

      expect(mockChatSend).toHaveBeenCalledTimes(1)
      const params = mockChatSend.mock.calls[0]![0].chatRequest
      expect(params.tools?.length).toBeGreaterThan(0)
      expect(params.responseFormat?.type).toBe('json_schema')

      expect(readCompleteObject(chunks)).toEqual({ answer: 'ok' })
    })

    it('parses final-turn JSON from the Responses adapter on the combined path', async () => {
      setupResponsesStream(responsesJsonChunks)
      const adapter = createOpenRouterResponsesText('openai/gpt-4o', 'k')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools,
        outputSchema: AnswerSchema,
        stream: true,
      })) {
        chunks.push(chunk)
      }

      expect(mockResponsesSend).toHaveBeenCalledTimes(1)
      const params = mockResponsesSend.mock.calls[0]![0].responsesRequest
      expect(params.tools).toBeDefined()
      expect(params.text?.format?.type).toBe('json_schema')

      expect(readCompleteObject(chunks)).toEqual({ answer: 'ok' })
    })
  })

  describe('set integrity', () => {
    const catalog = new Set<string>(OPENROUTER_CHAT_MODELS)

    it('every combined-mode id exists in the OpenRouter catalog', () => {
      for (const id of OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS) {
        expect(catalog.has(id), `${id} is not in OPENROUTER_CHAT_MODELS`).toBe(
          true,
        )
      }
    })

    it('every Gemini 3.x text catalog id is in the combined set', () => {
      for (const id of OPENROUTER_CHAT_MODELS) {
        if (!id.startsWith('google/gemini-3')) continue
        if (id.includes(':')) continue
        if (id.includes('-image')) continue
        expect(
          OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(id),
          `${id} is a Gemini 3.x text catalog id missing from the combined set`,
        ).toBe(true)
      }
    })

    it('every Grok 4.x tool-capable catalog id is in the combined set', () => {
      for (const id of OPENROUTER_CHAT_MODELS) {
        if (!id.startsWith('x-ai/grok-4')) continue
        if (id.includes(':')) continue
        if (id.includes('multi-agent')) continue
        expect(
          OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(id),
          `${id} is a Grok 4.x catalog id missing from the combined set`,
        ).toBe(true)
      }
    })
  })
})
