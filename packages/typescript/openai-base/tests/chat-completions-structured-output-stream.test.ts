/**
 * Unit tests for `OpenAIBaseChatCompletionsTextAdapter.structuredOutputStream`.
 *
 * The base adapter's streaming structured-output path is shared by every
 * subclass (ai-openai, ai-grok, ai-groq). These tests pin the AG-UI lifecycle
 * around the SDK chunk loop, the `response_format: json_schema` request shape,
 * the parse-error / empty-content failure paths, and the per-chunk
 * `logger.provider` debug emission added alongside the streaming feature.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import type OpenAI from 'openai'
import type { JSONSchema, StreamChunk } from '@tanstack/ai'
import {
  resolveDebugOption,
  type Logger,
} from '@tanstack/ai/adapter-internals'

let mockCreate: ReturnType<typeof vi.fn>

function makeStubClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: (params: unknown, options: unknown) =>
          mockCreate(params, options),
      },
    },
  } as unknown as OpenAI
}

class TestAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(model = 'test-model', name = 'openai-base') {
    super(model, name, makeStubClient())
  }
}

/** Create an async iterable over a fixed array. */
function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    },
  }
}

/** Wire `chat.completions.create` to yield `chunks` on the streaming path. */
function setupStreamingMock(chunks: Array<Record<string, unknown>>) {
  mockCreate = vi.fn().mockImplementation((params: { stream?: boolean }) => {
    if (!params.stream) {
      return Promise.resolve({ choices: [], model: 'test-model' })
    }
    return Promise.resolve(createAsyncIterable(chunks))
  })
}

/** Build a Chat Completions delta chunk with content. */
function deltaChunk(content: string, finishReason: string | null = null) {
  return {
    id: 'chatcmpl-1',
    model: 'test-model',
    choices: [{ delta: { content }, finish_reason: finishReason, index: 0 }],
  }
}

/** Terminal chunk (with usage). */
function finishChunk() {
  return {
    id: 'chatcmpl-1',
    model: 'test-model',
    choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }
}

const personSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
  required: ['name', 'age'],
  additionalProperties: false,
}

const testLogger = resolveDebugOption(false)

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

describe('OpenAIBaseChatCompletionsTextAdapter.structuredOutputStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    it('emits RUN_STARTED → TEXT_MESSAGE_* → structured-output.complete → RUN_FINISHED', async () => {
      const json = '{"name":"John","age":30}'
      setupStreamingMock([
        deltaChunk('{"name":'),
        deltaChunk('"John",'),
        deltaChunk('"age":30}'),
        finishChunk(),
      ])
      const adapter = new TestAdapter()

      const chunks = await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: testLogger,
          },
          outputSchema: personSchema,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types[0]).toBe('RUN_STARTED')
      expect(types).toContain('TEXT_MESSAGE_START')
      expect(types).toContain('TEXT_MESSAGE_CONTENT')
      expect(types).toContain('TEXT_MESSAGE_END')
      expect(types).toContain('CUSTOM')
      expect(types[types.length - 1]).toBe('RUN_FINISHED')

      const complete = chunks.find(
        (c) =>
          c.type === 'CUSTOM' &&
          (c as { name?: string }).name === 'structured-output.complete',
      ) as { value: { object: unknown; raw: string } } | undefined
      expect(complete).toBeDefined()
      expect(complete!.value.object).toEqual({ name: 'John', age: 30 })
      expect(complete!.value.raw).toBe(json)
    })

    it('sends response_format: { type: "json_schema", strict: true } in the request', async () => {
      setupStreamingMock([deltaChunk('{"name":"X","age":1}'), finishChunk()])
      const adapter = new TestAdapter()

      await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: testLogger,
          },
          outputSchema: personSchema,
        }),
      )

      expect(mockCreate).toHaveBeenCalledTimes(1)
      const request = mockCreate.mock.calls[0]![0] as {
        stream?: boolean
        response_format?: {
          type: string
          json_schema: { name: string; strict: boolean }
        }
        tools?: unknown
      }
      expect(request.stream).toBe(true)
      expect(request.response_format?.type).toBe('json_schema')
      expect(request.response_format?.json_schema.strict).toBe(true)
      // Tools must NOT be carried into the structured-output request — they
      // can confuse strict-mode json_schema validation upstream.
      expect(request.tools).toBeUndefined()
    })

    it('accumulates JSON text from deltas and emits exactly one structured-output.complete', async () => {
      setupStreamingMock([
        deltaChunk('{"name":"A"'),
        deltaChunk(',"age":7}'),
        finishChunk(),
      ])
      const adapter = new TestAdapter()

      const chunks = await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: testLogger,
          },
          outputSchema: personSchema,
        }),
      )

      const completeEvents = chunks.filter(
        (c) =>
          c.type === 'CUSTOM' &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(completeEvents.length).toBe(1)
      const value = (completeEvents[0] as { value: { object: unknown } }).value
      expect(value.object).toEqual({ name: 'A', age: 7 })
    })
  })

  describe('error paths', () => {
    it('emits RUN_ERROR { code: "empty-response" } when no content was produced', async () => {
      // Stream finishes with no text deltas at all (model returned nothing).
      setupStreamingMock([finishChunk()])
      const adapter = new TestAdapter()

      const chunks = await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: testLogger,
          },
          outputSchema: personSchema,
        }),
      )

      const runError = chunks.find((c) => c.type === 'RUN_ERROR') as
        | { type: 'RUN_ERROR'; code?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError!.code).toBe('empty-response')

      // No structured-output.complete should accompany the failure.
      const complete = chunks.find(
        (c) =>
          c.type === 'CUSTOM' &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(complete).toBeUndefined()
    })

    it('emits RUN_ERROR { code: "parse-error" } when the accumulated JSON is malformed', async () => {
      setupStreamingMock([deltaChunk('{not valid json'), finishChunk()])
      const adapter = new TestAdapter()

      const chunks = await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: testLogger,
          },
          outputSchema: personSchema,
        }),
      )

      const runError = chunks.find((c) => c.type === 'RUN_ERROR') as
        | { type: 'RUN_ERROR'; code?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError!.code).toBe('parse-error')
    })
  })

  describe('debug logging', () => {
    it('invokes logger.provider once per SDK chunk', async () => {
      const debugLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }
      const verboseLogger = resolveDebugOption({
        logger: debugLogger,
        provider: true,
        request: false,
        errors: false,
      })

      setupStreamingMock([
        deltaChunk('{"name":"X"'),
        deltaChunk(',"age":1}'),
        finishChunk(),
      ])
      const adapter = new TestAdapter()

      await collect(
        adapter.structuredOutputStream!({
          chatOptions: {
            model: 'test-model',
            messages: [{ role: 'user', content: 'extract' }],
            logger: verboseLogger,
          },
          outputSchema: personSchema,
        }),
      )

      // 3 SDK chunks → 3 provider log calls. Route into `Logger.debug` via
      // InternalLogger; filter to only the provider-category messages.
      const providerCalls = (
        debugLogger.debug as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([msg]) =>
        typeof msg === 'string' && msg.includes('tanstack-ai:provider'),
      )
      expect(providerCalls.length).toBe(3)
    })
  })
})
