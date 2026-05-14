/**
 * Unit tests for `OpenAIBaseResponsesTextAdapter.structuredOutputStream`.
 *
 * Mirrors the chat-completions structuredOutputStream tests but against the
 * Responses API event shape (`response.output_text.delta`, `response.completed`,
 * etc.). Pins the AG-UI lifecycle, the `text.format: json_schema` request
 * shape, error paths, and the per-chunk `logger.provider` debug emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type OpenAI from 'openai'
import type { JSONSchema, StreamChunk } from '@tanstack/ai'
import {
  resolveDebugOption,
  type Logger,
} from '@tanstack/ai/adapter-internals'

let mockCreate: ReturnType<typeof vi.fn>

function makeStubClient(): OpenAI {
  return {
    responses: {
      create: (params: unknown, options: unknown) =>
        mockCreate(params, options),
    },
  } as unknown as OpenAI
}

class TestAdapter extends OpenAIBaseResponsesTextAdapter<string> {
  constructor(model = 'test-model', name = 'openai-base-responses') {
    super(model, name, makeStubClient())
  }
}

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    },
  }
}

function setupStreamingMock(chunks: Array<Record<string, unknown>>) {
  mockCreate = vi.fn().mockImplementation((params: { stream?: boolean }) => {
    if (!params.stream) {
      return Promise.resolve({ output: [], model: 'test-model' })
    }
    return Promise.resolve(createAsyncIterable(chunks))
  })
}

// Responses API event constructors. Field names mirror the openai SDK shape.
function eventCreated() {
  return { type: 'response.created', response: { model: 'test-model' } }
}
function eventOutputTextDelta(delta: string) {
  return { type: 'response.output_text.delta', delta }
}
function eventCompleted(
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } = {
    input_tokens: 10,
    output_tokens: 20,
    total_tokens: 30,
  },
) {
  return {
    type: 'response.completed',
    response: { model: 'test-model', usage },
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

describe('OpenAIBaseResponsesTextAdapter.structuredOutputStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    it('emits RUN_STARTED → TEXT_MESSAGE_* → structured-output.complete → RUN_FINISHED', async () => {
      const json = '{"name":"John","age":30}'
      setupStreamingMock([
        eventCreated(),
        eventOutputTextDelta('{"name":'),
        eventOutputTextDelta('"John",'),
        eventOutputTextDelta('"age":30}'),
        eventCompleted(),
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

    it('sends text.format: { type: "json_schema", strict: true } in the request', async () => {
      setupStreamingMock([
        eventCreated(),
        eventOutputTextDelta('{"name":"X","age":1}'),
        eventCompleted(),
      ])
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
        text?: { format?: { type: string; strict: boolean; name: string } }
        tools?: unknown
      }
      expect(request.stream).toBe(true)
      expect(request.text?.format?.type).toBe('json_schema')
      expect(request.text?.format?.strict).toBe(true)
      // Tools must NOT be carried into the structured-output request.
      expect(request.tools).toBeUndefined()
    })

    it('forwards usage on the terminal RUN_FINISHED event', async () => {
      setupStreamingMock([
        eventCreated(),
        eventOutputTextDelta('{"name":"A","age":2}'),
        eventCompleted({
          input_tokens: 5,
          output_tokens: 8,
          total_tokens: 13,
        }),
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

      const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as
        | {
            type: 'RUN_FINISHED'
            usage?: {
              promptTokens: number
              completionTokens: number
              totalTokens: number
            }
          }
        | undefined
      expect(finished).toBeDefined()
      expect(finished!.usage).toEqual({
        promptTokens: 5,
        completionTokens: 8,
        totalTokens: 13,
      })
    })
  })

  describe('error paths', () => {
    it('emits RUN_ERROR { code: "empty-response" } when no output_text.delta was received', async () => {
      setupStreamingMock([eventCreated(), eventCompleted()])
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

      const complete = chunks.find(
        (c) =>
          c.type === 'CUSTOM' &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(complete).toBeUndefined()
    })

    it('emits RUN_ERROR { code: "parse-error" } when the accumulated JSON is malformed', async () => {
      setupStreamingMock([
        eventCreated(),
        eventOutputTextDelta('{not valid json'),
        eventCompleted(),
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

      const runError = chunks.find((c) => c.type === 'RUN_ERROR') as
        | { type: 'RUN_ERROR'; code?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError!.code).toBe('parse-error')
    })

    it('emits RUN_ERROR { code: "refusal" } on response.refusal.delta', async () => {
      setupStreamingMock([
        eventCreated(),
        { type: 'response.refusal.delta', delta: 'cannot do this' },
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

      const runError = chunks.find((c) => c.type === 'RUN_ERROR') as
        | { type: 'RUN_ERROR'; code?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError!.code).toBe('refusal')
    })
  })

  describe('debug logging', () => {
    it('invokes logger.provider once per SDK event', async () => {
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

      const events = [
        eventCreated(),
        eventOutputTextDelta('{"name":"X"'),
        eventOutputTextDelta(',"age":1}'),
        eventCompleted(),
      ]
      setupStreamingMock(events)
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

      const providerCalls = (
        debugLogger.debug as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([msg]) =>
        typeof msg === 'string' && msg.includes('tanstack-ai:provider'),
      )
      expect(providerCalls.length).toBe(events.length)
    })
  })
})
