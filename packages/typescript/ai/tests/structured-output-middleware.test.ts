/**
 * Unit tests covering middleware coverage of the final structured-output
 * provider call — the fix for issue #390.
 *
 * These tests assert that middleware sees chunks attributed to
 * phase === 'structuredOutput', and that lifecycle hooks fire exactly once
 * for the whole chat() invocation (including finalization).
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { createMockAdapter, ev } from './test-utils'
import type {
  RunFinishedEvent,
  StreamChunk,
  StructuredOutputCompleteEvent,
  StructuredOutputStartEvent,
} from '../src/types'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewarePhase,
  FinishInfo,
  StructuredOutputMiddlewareConfig,
  UsageInfo,
} from '../src/activities/chat/middleware/types'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
})
type Person = z.infer<typeof PersonSchema>

const PERSON: Person = { name: 'Alice', age: 30 }

/** Typed structured-output.start event — no cast needed because we name
 *  the precise interface from src/types.ts. */
function structuredStartEvent(messageId: string): StructuredOutputStartEvent {
  return {
    type: EventType.CUSTOM,
    name: 'structured-output.start',
    value: { messageId },
    timestamp: Date.now(),
  }
}

/** Typed structured-output.complete event. */
function structuredCompleteEvent<T>(
  value: T,
): StructuredOutputCompleteEvent<T> {
  return {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: { object: value, raw: JSON.stringify(value) },
    timestamp: Date.now(),
  }
}

/** Records (phase, chunkType) per onChunk firing plus every lifecycle hook
 *  firing. Use the returned middleware in chat({ middleware: [...] }) and
 *  inspect the logs afterwards. */
function spy() {
  const chunkLog: Array<{ phase: ChatMiddlewarePhase; type: string }> = []
  const hookLog: Array<string> = []
  const configLog: Array<
    | {
        phase: ChatMiddlewarePhase
        hook: 'onConfig'
        config: ChatMiddlewareConfig
      }
    | {
        phase: ChatMiddlewarePhase
        hook: 'onStructuredOutputConfig'
        config: StructuredOutputMiddlewareConfig
      }
  > = []

  const middleware: ChatMiddleware = {
    name: 'spy',
    onConfig(ctx, config) {
      configLog.push({ phase: ctx.phase, hook: 'onConfig', config })
    },
    onStructuredOutputConfig(ctx, config) {
      configLog.push({
        phase: ctx.phase,
        hook: 'onStructuredOutputConfig',
        config,
      })
    },
    onStart() {
      hookLog.push('onStart')
    },
    onIteration(_ctx, info) {
      hookLog.push(`onIteration:${info.iteration}`)
    },
    onChunk(ctx, chunk) {
      chunkLog.push({ phase: ctx.phase, type: chunk.type })
    },
    onUsage() {
      hookLog.push('onUsage')
    },
    onFinish() {
      hookLog.push('onFinish')
    },
    onAbort() {
      hookLog.push('onAbort')
    },
    onError() {
      hookLog.push('onError')
    },
  }

  return { middleware, chunkLog, hookLog, configLog }
}

type Recorder = Array<{ chatOptions: unknown; outputSchema: unknown }>

/** Build the chunk sequence the mock structured-output stream emits.
 *  Uses typed `ev.*` factories (RunStartedEvent, TextMessage*Event,
 *  RunFinishedEvent) and the typed `structured*Event` helpers above.
 *  No `as X` casts. */
function buildStructuredStream(
  value: Person,
  usage?: RunFinishedEvent['usage'],
): Array<StreamChunk> {
  return [
    ev.runStarted('mock-run', 'mock-thread'),
    structuredStartEvent('mock-msg'),
    ev.textStart('mock-msg'),
    ev.textContent(JSON.stringify(value), 'mock-msg'),
    ev.textEnd('mock-msg'),
    structuredCompleteEvent(value),
    ev.runFinished('stop', 'mock-run', usage, 'mock-thread'),
  ]
}

function makeAdapter(opts: {
  agentIterations?: Array<Array<StreamChunk>>
  structuredValue?: Person
  structuredRunFinishedUsage?: RunFinishedEvent['usage']
  structuredOutputThrows?: Error
  noNativeStructuredOutputStream?: boolean
  recordStructuredCalls?: Recorder
}) {
  const value = opts.structuredValue ?? PERSON
  const recordIn = opts.recordStructuredCalls

  const { adapter } = createMockAdapter({
    iterations: opts.agentIterations,
    structuredOutput: async (o) => {
      if (recordIn) {
        recordIn.push({
          chatOptions: o.chatOptions,
          outputSchema: o.outputSchema,
        })
      }
      if (opts.structuredOutputThrows) throw opts.structuredOutputThrows
      return { data: value, rawText: JSON.stringify(value) }
    },
    ...(opts.noNativeStructuredOutputStream
      ? {}
      : {
          structuredOutputStream: (o) => {
            if (recordIn) {
              recordIn.push({
                chatOptions: o.chatOptions,
                outputSchema: o.outputSchema,
              })
            }
            const chunks = buildStructuredStream(
              value,
              opts.structuredRunFinishedUsage,
            )
            return (async function* () {
              for (const c of chunks) yield c
            })()
          },
        }),
  })

  return adapter
}

describe('chat({ outputSchema }) — Promise<T> path', () => {
  it('middleware observes chunks attributed to phase=structuredOutput', async () => {
    const { middleware, chunkLog, hookLog, configLog } = spy()

    // No tools — agent loop runs zero iterations, engine goes straight to finalization
    const adapter = makeAdapter({
      agentIterations: [],
      structuredRunFinishedUsage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    })

    // chat({ outputSchema: PersonSchema }) is inferred as Promise<Person> —
    // no cast needed.
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [middleware],
    })

    // The structured-output value flows back to the caller
    expect(result).toEqual(PERSON)

    // Middleware saw at least one chunk in the structuredOutput phase including the
    // CUSTOM structured-output.complete event
    const structuredChunks = chunkLog.filter(
      (c) => c.phase === 'structuredOutput',
    )
    expect(structuredChunks.length).toBeGreaterThan(0)
    expect(structuredChunks.some((c) => c.type === EventType.CUSTOM)).toBe(true)

    // onFinish fires exactly once, AFTER the structured chunks
    expect(hookLog.filter((h) => h === 'onFinish')).toHaveLength(1)
    expect(hookLog.filter((h) => h === 'onError')).toHaveLength(0)
    expect(hookLog.filter((h) => h === 'onAbort')).toHaveLength(0)

    // onUsage fires for finalization usage
    expect(hookLog.filter((h) => h === 'onUsage')).toHaveLength(1)

    // onStructuredOutputConfig fired exactly once with outputSchema in the config.
    // The discriminated configLog narrows .config to StructuredOutputMiddlewareConfig
    // automatically via .hook — no cast needed.
    const structuredConfigCalls = configLog.filter(
      (e) => e.hook === 'onStructuredOutputConfig',
    )
    expect(structuredConfigCalls).toHaveLength(1)
    expect(structuredConfigCalls[0]!.config.outputSchema).toBeDefined()
  })

  it('onFinish info reflects agent-loop terminal state; finalization tokens observed via onUsage', async () => {
    const finishInfo: Array<FinishInfo> = []
    const usageEvents: Array<UsageInfo> = []

    const recordFinish: ChatMiddleware = {
      name: 'record-finish',
      onFinish: (_ctx, info) => {
        finishInfo.push(info)
      },
      onUsage: (_ctx, usage) => {
        usageEvents.push(usage)
      },
    }

    // Tools-less structured-output run: agent loop yields zero iterations
    // (no RUN_FINISHED), so `info.usage`/`info.finishReason` should reflect
    // the agent-loop's *absence* of a terminal RUN_FINISHED — NOT the
    // finalization step's usage. The finalization usage is delivered via
    // `onUsage` instead.
    const adapter = makeAdapter({
      agentIterations: [],
      structuredRunFinishedUsage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    })

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [recordFinish],
    })

    // onUsage fires exactly once — for finalization's RUN_FINISHED.
    expect(usageEvents).toHaveLength(1)
    expect(usageEvents[0]).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    })

    // onFinish fires exactly once. info.* reflects the agent loop's terminal
    // state; with no tool-using iterations, the agent loop produced no
    // RUN_FINISHED, so usage is undefined and finishReason is null.
    expect(finishInfo).toHaveLength(1)
    const info = finishInfo[0]!
    expect(info.usage).toBeUndefined()
    expect(info.finishReason).toBeNull()
    expect(info.content).toBe('')
  })
})

describe('chat({ outputSchema, stream: true }) — streaming path', () => {
  it('middleware observes chunks attributed to phase=structuredOutput and only one outer RUN_STARTED/RUN_FINISHED reaches consumer', async () => {
    const { middleware, chunkLog, hookLog } = spy()
    const adapter = makeAdapter({ agentIterations: [] })

    // `chat({ outputSchema, stream: true })` returns a
    // `StructuredOutputStream<Person>` which is an AsyncIterable of typed
    // chunks. Consume directly via for-await — no cast needed.
    const yielded: Array<StreamChunk> = []
    for await (const c of chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      stream: true,
      middleware: [middleware],
    })) {
      yielded.push(c)
    }

    // Consumer sees exactly one RUN_STARTED and one RUN_FINISHED for the whole run
    const runStarted = yielded.filter((c) => c.type === EventType.RUN_STARTED)
    const runFinished = yielded.filter((c) => c.type === EventType.RUN_FINISHED)
    expect(runStarted).toHaveLength(1)
    expect(runFinished).toHaveLength(1)

    // The structured-output.complete CUSTOM event reaches the consumer.
    // `c.type === EventType.CUSTOM` narrows to CustomEvent, exposing `.name`
    // directly — no cast.
    const complete = yielded.find(
      (c) =>
        c.type === EventType.CUSTOM && c.name === 'structured-output.complete',
    )
    expect(complete).toBeDefined()

    // Middleware saw chunks in the structuredOutput phase
    const structuredChunks = chunkLog.filter(
      (c) => c.phase === 'structuredOutput',
    )
    expect(structuredChunks.length).toBeGreaterThan(0)

    // Terminal hook exclusivity
    expect(hookLog.filter((h) => h === 'onFinish')).toHaveLength(1)
    expect(hookLog.filter((h) => h === 'onError')).toHaveLength(0)
  })
})

describe('onStructuredOutputConfig transforms', () => {
  it('can mutate outputSchema before the adapter call', async () => {
    const calls: Recorder = []
    const adapter = makeAdapter({ recordStructuredCalls: calls })

    // `config.outputSchema` is typed as `JSONSchema`, which is already an
    // object-shaped union — spread is allowed without a cast.
    const mutator: ChatMiddleware = {
      name: 'mutate-schema',
      onStructuredOutputConfig(_ctx, config) {
        return {
          outputSchema: { ...config.outputSchema, $injected: true },
        }
      },
    }

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [mutator],
    })

    expect(calls).toHaveLength(1)

    // toMatchObject works against `unknown` without casts — vitest does the
    // structural check at runtime.
    expect(calls[0]!.outputSchema).toMatchObject({ $injected: true })
  })

  it('can strip systemPrompts from messages going to the final call', async () => {
    const calls: Recorder = []
    const adapter = makeAdapter({ recordStructuredCalls: calls })

    const stripper: ChatMiddleware = {
      name: 'strip-system',
      onStructuredOutputConfig() {
        return { systemPrompts: [] }
      },
    }

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      systemPrompts: [{ content: 'You are helpful' }],
      outputSchema: PersonSchema,
      middleware: [stripper],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.chatOptions).toMatchObject({ systemPrompts: [] })
  })

  it('void return is a no-op', async () => {
    const calls: Recorder = []
    const adapter = makeAdapter({ recordStructuredCalls: calls })

    const noop: ChatMiddleware = {
      name: 'noop',
      onStructuredOutputConfig() {
        // void
      },
    }

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [noop],
    })

    expect(calls).toHaveLength(1)
  })

  it('can replace messages before the final structured-output call', async () => {
    const calls: Recorder = []
    const adapter = makeAdapter({ recordStructuredCalls: calls })

    const replaced = [
      { role: 'user' as const, content: 'REPLACED — extract a person' },
    ]
    const replacer: ChatMiddleware = {
      name: 'replace-messages',
      onStructuredOutputConfig() {
        return { messages: replaced }
      },
    }

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'original message' }],
      outputSchema: PersonSchema,
      middleware: [replacer],
    })

    expect(calls).toHaveLength(1)
    const sentMessages = (
      calls[0]!.chatOptions as { messages: Array<{ content: string }> }
    ).messages
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]!.content).toBe('REPLACED — extract a person')
  })
})

describe('failure paths', () => {
  it('onError fires once when adapter.structuredOutput throws (no native streaming)', async () => {
    const { middleware, hookLog } = spy()
    const adapter = makeAdapter({
      noNativeStructuredOutputStream: true,
      structuredOutputThrows: new Error('boom'),
    })

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Give me a person' }],
        outputSchema: PersonSchema,
        middleware: [middleware],
      }),
    ).rejects.toThrow(/boom|structured/)

    expect(hookLog.filter((h) => h === 'onError')).toHaveLength(1)
    expect(hookLog.filter((h) => h === 'onFinish')).toHaveLength(0)
  })

  it('schema validation failure routes through onError', async () => {
    const { middleware, hookLog, chunkLog } = spy()

    // Build a malformed result without casts: use createMockAdapter directly
    // so the result `data` can legally diverge from PersonSchema.
    const { adapter } = createMockAdapter({
      structuredOutput: async () => ({
        data: { name: 'Alice', age: 'not-a-number' },
        rawText: JSON.stringify({ name: 'Alice', age: 'not-a-number' }),
      }),
      structuredOutputStream: () =>
        (async function* () {
          yield ev.runStarted('mock-run', 'mock-thread')
          yield structuredStartEvent('mock-msg')
          yield ev.textStart('mock-msg')
          yield ev.textContent(
            JSON.stringify({ name: 'Alice', age: 'not-a-number' }),
            'mock-msg',
          )
          yield ev.textEnd('mock-msg')
          yield structuredCompleteEvent({ name: 'Alice', age: 'not-a-number' })
          yield ev.runFinished('stop', 'mock-run', undefined, 'mock-thread')
        })(),
    })

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Give me a person' }],
        outputSchema: PersonSchema,
        middleware: [middleware],
      }),
    ).rejects.toThrow()

    // Middleware still observed the optimistic structured-output.complete chunk
    const completeChunks = chunkLog.filter(
      (c) => c.phase === 'structuredOutput' && c.type === EventType.CUSTOM,
    )
    expect(completeChunks.length).toBeGreaterThan(0)

    expect(hookLog.filter((h) => h === 'onError')).toHaveLength(1)
    expect(hookLog.filter((h) => h === 'onFinish')).toHaveLength(0)
  })

  it('mid-finalization abort routes through onAbort with phase=structuredOutput', async () => {
    const hookLog: Array<{
      hook: 'onAbort' | 'onFinish' | 'onError'
      phase: ChatMiddlewarePhase
    }> = []

    let abortPhaseSeen: ChatMiddlewarePhase | undefined

    const aborter: ChatMiddleware = {
      name: 'aborter',
      onChunk(ctx) {
        if (ctx.phase === 'structuredOutput' && !abortPhaseSeen) {
          abortPhaseSeen = ctx.phase
          ctx.abort('mid-finalization abort')
        }
      },
      onAbort(ctx) {
        hookLog.push({ hook: 'onAbort', phase: ctx.phase })
      },
      onFinish(ctx) {
        hookLog.push({ hook: 'onFinish', phase: ctx.phase })
      },
      onError(ctx) {
        hookLog.push({ hook: 'onError', phase: ctx.phase })
      },
    }

    const adapter = makeAdapter({})

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [aborter],
    }).catch(() => {
      // chat() rejects when middleware aborts; we only care about hook routing
    })

    expect(hookLog.filter((h) => h.hook === 'onAbort')).toHaveLength(1)
    expect(hookLog.filter((h) => h.hook === 'onFinish')).toHaveLength(0)
    expect(hookLog.filter((h) => h.hook === 'onError')).toHaveLength(0)
    expect(hookLog[0]!.phase).toBe('structuredOutput')
  })

  it('validation failure preserves Standard Schema issues[] on the error received by onError', async () => {
    let capturedError: unknown = undefined
    const recorder: ChatMiddleware = {
      name: 'recorder',
      onError(_ctx, info) {
        capturedError = info.error
      },
    }

    const { adapter } = createMockAdapter({
      structuredOutput: async () => ({
        data: { name: 'Alice', age: 'not-a-number' },
        rawText: JSON.stringify({ name: 'Alice', age: 'not-a-number' }),
      }),
    })

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Give me a person' }],
        outputSchema: PersonSchema,
        middleware: [recorder],
      }),
    ).rejects.toThrow()

    // The error reaching onError has its `cause` set to the original
    // StandardSchemaValidationError, whose `issues` array exposes each
    // validator failure (path, message, expected/received) for programmatic
    // inspection.
    expect(capturedError).toBeInstanceOf(Error)
    const errWithCause = capturedError as { cause?: unknown; code?: unknown }
    expect(errWithCause.code).toBe('structured-output-validation-failed')
    expect(errWithCause.cause).toBeDefined()
    const cause = errWithCause.cause as { name?: string; issues?: unknown }
    expect(cause.name).toBe('StandardSchemaValidationError')
    expect(Array.isArray(cause.issues)).toBe(true)
    expect((cause.issues as Array<unknown>).length).toBeGreaterThan(0)
  })

  it('empty stream produces missing-result error', async () => {
    const { middleware, hookLog } = spy()
    const adapter = makeAdapter({})
    // Replace structuredOutputStream with an empty stream
    adapter.structuredOutputStream = () =>
      (async function* () {
        // yield nothing
      })()

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Give me a person' }],
        outputSchema: PersonSchema,
        middleware: [middleware],
      }),
    ).rejects.toThrow(/missing structured result/i)

    expect(hookLog.filter((h) => h === 'onError')).toHaveLength(1)
  })
})

describe('backward compatibility', () => {
  it('chat({ outputSchema }) with no middleware returns the same data as before', async () => {
    const adapter = makeAdapter({})
    // `chat({ outputSchema: PersonSchema })` is inferred as Promise<Person>.
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
    })
    expect(result).toEqual(PERSON)
  })

  it('phase reuse: onConfig re-fires at structured-output boundary with the new phase', async () => {
    const { middleware, configLog } = spy()
    const adapter = makeAdapter({})

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [middleware],
    })

    const structuredOnConfig = configLog.filter(
      (e) => e.hook === 'onConfig' && e.phase === 'structuredOutput',
    )
    expect(structuredOnConfig.length).toBeGreaterThanOrEqual(1)
  })
})

describe('adapter fallback (no native structuredOutputStream)', () => {
  it('middleware still sees synthesized chunks via fallbackStructuredOutputStream', async () => {
    const { middleware, chunkLog } = spy()
    const adapter = makeAdapter({ noNativeStructuredOutputStream: true })

    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give me a person' }],
      outputSchema: PersonSchema,
      middleware: [middleware],
    })

    const structuredChunks = chunkLog.filter(
      (c) => c.phase === 'structuredOutput',
    )
    expect(structuredChunks.length).toBeGreaterThan(0)
    expect(structuredChunks.some((c) => c.type === EventType.CUSTOM)).toBe(true)
  })
})
