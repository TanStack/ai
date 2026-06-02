/**
 * Unit tests for the structured-output schema-rejection fallback added in
 * issue #682.
 *
 * When a provider rejects an over-large/complex structured-output schema
 * (Anthropic: "compiled grammar is too large"), `chat({ outputSchema })`
 * under the default `structuredOutput: 'auto'` transparently re-runs through
 * the lenient forced-tool path instead of surfacing a hard RUN_ERROR. The
 * `'native'` / `'tool'` values pin the explicit behaviors.
 *
 * Two adapter shapes are covered:
 *  - native-combined (Anthropic 4.5+): the schema rides the agent-loop
 *    `chatStream`; rejection arrives as a RUN_ERROR chunk.
 *  - finalization (OpenRouter): the schema rides `structuredOutputStream`;
 *    rejection arrives during that stream.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter } from './test-utils'
import type { StreamChunk } from '../src/types'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
})
type Person = z.infer<typeof PersonSchema>

const validPerson: Person = { name: 'Ada Lovelace', age: 36 }
const validJson = JSON.stringify(validPerson)

const GRAMMAR_ERROR =
  'output_config.format.schema: Invalid schema: The compiled grammar is too large, ' +
  'which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.'

const isGrammarError = (error: unknown): boolean => {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error)
  return text.toLowerCase().includes('compiled grammar is too large')
}

const ts = () => Date.now()

/** A request-time RUN_ERROR (no RUN_STARTED, no content) — what a provider
 *  emits when it rejects the schema before streaming begins. */
function grammarRunErrorTurn(): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_ERROR,
      message: GRAMMAR_ERROR,
      code: '400',
      timestamp: ts(),
      error: { message: GRAMMAR_ERROR, code: '400' },
    },
  ]
}

/** A successful finalization stream carrying the schema-constrained JSON. */
async function* successFinalizationStream(): AsyncIterable<StreamChunk> {
  const t = ts()
  yield {
    type: EventType.RUN_STARTED,
    runId: 'fin',
    threadId: 'thread-1',
    timestamp: t,
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'fin-1',
    role: 'assistant',
    timestamp: t,
  }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'fin-1',
    delta: validJson,
    timestamp: t,
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId: 'fin-1', timestamp: t }
  yield {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: { object: validPerson, raw: validJson },
    timestamp: t,
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: 'fin',
    threadId: 'thread-1',
    finishReason: 'stop',
    timestamp: t,
  }
}

/** A finalization stream that rejects the schema mid-stream. */
async function* grammarFinalizationStream(): AsyncIterable<StreamChunk> {
  const t = ts()
  yield {
    type: EventType.RUN_STARTED,
    runId: 'fin',
    threadId: 'thread-1',
    timestamp: t,
  }
  yield {
    type: EventType.RUN_ERROR,
    message: GRAMMAR_ERROR,
    code: '400',
    timestamp: t,
    error: { message: GRAMMAR_ERROR, code: '400' },
  }
}

function completeChunk(chunks: Array<StreamChunk>) {
  return chunks.find(
    (c) =>
      c.type === EventType.CUSTOM &&
      (c as { name?: string }).name === 'structured-output.complete',
  ) as { value: { object: unknown } } | undefined
}

describe('chat({ outputSchema }) — schema-rejection fallback (#682)', () => {
  describe('native-combined adapter (Anthropic 4.5+ shape)', () => {
    it('auto: streaming falls back to the forced-tool path and yields one clean run', async () => {
      const strategies: Array<string | undefined> = []
      const { adapter, calls } = createMockAdapter({
        iterations: [grammarRunErrorTurn()],
        supportsCombinedToolsAndSchema: true,
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutput: async (opts: { strategy?: string }) => {
          strategies.push(opts.strategy)
          return { data: validPerson, rawText: validJson }
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'extract' }],
          outputSchema: PersonSchema,
          stream: true,
        }),
      )

      // The native attempt's chatStream ran once (and was rejected); the
      // forced-tool retry used the non-streaming structuredOutput.
      expect(calls.length).toBe(1)
      expect(strategies).toEqual(['tool'])

      // The recovered run carries the parsed object...
      expect(completeChunk(chunks)?.value.object).toEqual(validPerson)
      // ...and the grammar RUN_ERROR never reaches the consumer.
      expect(chunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(false)
      // Exactly one lifecycle (the discarded native attempt is withheld).
      expect(
        chunks.filter((c) => c.type === EventType.RUN_STARTED).length,
      ).toBe(1)
    })

    it('auto: Promise<T> falls back and returns the validated value', async () => {
      const strategies: Array<string | undefined> = []
      const { adapter, calls } = createMockAdapter({
        iterations: [grammarRunErrorTurn()],
        supportsCombinedToolsAndSchema: true,
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutput: async (opts: { strategy?: string }) => {
          strategies.push(opts.strategy)
          return { data: validPerson, rawText: validJson }
        },
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
      })

      expect(result).toEqual(validPerson)
      expect(calls.length).toBe(1)
      expect(strategies).toEqual(['tool'])
    })

    it('native: no fallback — the rejection surfaces and the tool path is never called', async () => {
      let structuredCalled = false
      const { adapter } = createMockAdapter({
        iterations: [grammarRunErrorTurn()],
        supportsCombinedToolsAndSchema: true,
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutput: async () => {
          structuredCalled = true
          return { data: validPerson, rawText: validJson }
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'extract' }],
          outputSchema: PersonSchema,
          stream: true,
          structuredOutput: 'native',
        }),
      )

      expect(structuredCalled).toBe(false)
      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR) as
        | { message?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError?.message).toContain('compiled grammar is too large')
    })

    it('tool: forces the forced-tool path up front (no native attempt)', async () => {
      const strategies: Array<string | undefined> = []
      const { adapter, calls } = createMockAdapter({
        iterations: [grammarRunErrorTurn()],
        supportsCombinedToolsAndSchema: true,
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutput: async (opts: { strategy?: string }) => {
          strategies.push(opts.strategy)
          return { data: validPerson, rawText: validJson }
        },
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        structuredOutput: 'tool',
      })

      expect(result).toEqual(validPerson)
      // No native chatStream attempt; straight to the forced-tool call.
      expect(calls.length).toBe(0)
      expect(strategies).toEqual(['tool'])
    })

    it('auto: a non-schema error is not retried (predicate returns false)', async () => {
      let structuredCalled = false
      const { adapter } = createMockAdapter({
        iterations: [
          [
            {
              type: EventType.RUN_ERROR,
              message: 'rate limit exceeded',
              code: '429',
              timestamp: ts(),
              error: { message: 'rate limit exceeded', code: '429' },
            },
          ],
        ],
        supportsCombinedToolsAndSchema: true,
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutput: async () => {
          structuredCalled = true
          return { data: validPerson, rawText: validJson }
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'extract' }],
          outputSchema: PersonSchema,
          stream: true,
        }),
      )

      // No forced-tool retry for an unrelated failure.
      expect(structuredCalled).toBe(false)
      expect(chunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(true)
      expect(completeChunk(chunks)).toBeUndefined()
    })
  })

  describe('finalization adapter (OpenRouter shape)', () => {
    it('auto: streaming falls back through structuredOutputStream in tool mode', async () => {
      const strategies: Array<string | undefined> = []
      const { adapter } = createMockAdapter({
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutputStream: (opts: { strategy?: string }) => {
          strategies.push(opts.strategy)
          return opts.strategy === 'tool'
            ? successFinalizationStream()
            : grammarFinalizationStream()
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'extract' }],
          outputSchema: PersonSchema,
          stream: true,
        }),
      )

      // Native (json_schema) attempt rejected, then a tool-mode retry.
      expect(strategies).toEqual([undefined, 'tool'])
      expect(completeChunk(chunks)?.value.object).toEqual(validPerson)
      expect(chunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(false)
      expect(
        chunks.filter((c) => c.type === EventType.RUN_STARTED).length,
      ).toBe(1)
    })

    it('auto: Promise<T> falls back and returns the validated value', async () => {
      const strategies: Array<string | undefined> = []
      const { adapter } = createMockAdapter({
        isStructuredOutputSchemaError: isGrammarError,
        structuredOutputStream: (opts: { strategy?: string }) => {
          strategies.push(opts.strategy)
          return opts.strategy === 'tool'
            ? successFinalizationStream()
            : grammarFinalizationStream()
        },
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
      })

      expect(result).toEqual(validPerson)
      expect(strategies).toEqual([undefined, 'tool'])
    })
  })
})
