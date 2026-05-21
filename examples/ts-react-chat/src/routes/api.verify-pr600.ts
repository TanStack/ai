import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { chat, StandardSchemaValidationError } from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  StreamChunk,
} from '@tanstack/ai'
import { EventType } from '@tanstack/ai'

/**
 * Server-side verification of the PR #600 review fixes. Each scenario runs a
 * tiny `chat()` invocation against a hand-rolled mock adapter and reports
 * what was observed.
 *
 * The mocks are intentionally minimal: no real provider keys needed. The
 * point is to exercise the engine's structured-output code path end-to-end
 * — the same path that runs in production — and report the user-visible
 * outcomes the review identified.
 */

const PersonSchema = z.object({ name: z.string(), age: z.number() })
const PERSON = { name: 'Alice', age: 30 }

function buildStreamingAdapter(opts: {
  onChatStream?: () => void
  onStructuredStream?: () => void
}): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {} as never,
    chatStream: () => {
      opts.onChatStream?.()
      return (async function* () {
        // empty — model has nothing to say without tools
      })()
    },
    structuredOutputStream: () => {
      opts.onStructuredStream?.()
      return (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm',
          role: 'assistant',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm',
          delta: JSON.stringify(PERSON),
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'm',
          timestamp: Date.now(),
        }
        yield {
          type: EventType.CUSTOM,
          name: 'structured-output.complete',
          value: { object: PERSON, raw: JSON.stringify(PERSON) },
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          finishReason: 'stop',
          timestamp: Date.now(),
        }
      })()
    },
    structuredOutput: async () => ({
      data: PERSON,
      rawText: JSON.stringify(PERSON),
    }),
  } as AnyTextAdapter
}

interface ScenarioResult {
  id: string
  title: string
  description: string
  pass: boolean
  observed: Record<string, unknown>
}

async function scenario1_noToolsDoubleCall(): Promise<ScenarioResult> {
  let chatStreamCalls = 0
  let structuredCalls = 0
  const adapter = buildStreamingAdapter({
    onChatStream: () => chatStreamCalls++,
    onStructuredStream: () => structuredCalls++,
  })

  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'extract' }],
    outputSchema: PersonSchema,
    stream: true,
  })
  for await (const _ of stream as AsyncIterable<StreamChunk>) {
    /* drain */
  }

  return {
    id: 'critical-1',
    title: 'Critical #1 — no-tools double-call',
    description:
      'Streaming structured output without tools must NOT call chatStream before finalization.',
    pass: chatStreamCalls === 0 && structuredCalls === 1,
    observed: { chatStreamCalls, structuredCalls },
  }
}

async function scenario2_validationIssuesPreserved(): Promise<ScenarioResult> {
  let captured: unknown = undefined
  const recorder: ChatMiddleware = {
    name: 'recorder',
    onError(_ctx, info) {
      captured = info.error
    },
  }

  const malformed = { name: 'Alice', age: 'not-a-number' }
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'm',
    '~types': {} as never,
    chatStream: () => (async function* () {})(),
    structuredOutput: async () => ({
      data: malformed,
      rawText: JSON.stringify(malformed),
    }),
  } as AnyTextAdapter

  try {
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: PersonSchema,
      middleware: [recorder],
    })
  } catch {
    /* expected */
  }

  const err = captured as { cause?: unknown; code?: unknown } | undefined
  const cause = err?.cause as StandardSchemaValidationError | undefined
  const isTyped = cause instanceof StandardSchemaValidationError
  const issues = isTyped ? cause.issues : []

  return {
    id: 'important-4',
    title: 'Important #4 — validation issues[] preserved',
    description:
      'Standard Schema validation failures must expose the original `issues` array via error.cause so consumers can inspect each failure programmatically.',
    pass:
      err?.code === 'structured-output-validation-failed' &&
      isTyped &&
      issues.length > 0,
    observed: {
      errorCode: String(err?.code),
      causeName: cause?.name,
      isStandardSchemaValidationError: isTyped,
      issueCount: issues.length,
      firstIssue: issues[0],
    },
  }
}

async function scenario3_fallbackErrorPreservation(): Promise<ScenarioResult> {
  let captured: unknown = undefined
  const recorder: ChatMiddleware = {
    name: 'recorder',
    onError(_ctx, info) {
      captured = info.error
    },
  }

  class ProviderRateLimitError extends Error {
    readonly status = 429
    readonly providerCode = 'rate_limited'
    constructor() {
      super('upstream rate limited')
      this.name = 'ProviderRateLimitError'
    }
  }
  const originalError = new ProviderRateLimitError()

  // Adapter WITHOUT structuredOutputStream so the fallback synthesizer is used.
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'm',
    '~types': {} as never,
    chatStream: () => (async function* () {})(),
    structuredOutput: async () => {
      throw originalError
    },
  } as AnyTextAdapter

  try {
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: PersonSchema,
      middleware: [recorder],
    })
  } catch {
    /* expected */
  }

  const err = captured as { cause?: unknown } | undefined
  const cause = err?.cause as
    | { status?: number; providerCode?: string; name?: string }
    | undefined

  return {
    id: 'important-5',
    title: 'Important #5 — fallback path preserves original error',
    description:
      'When an adapter lacking native streaming throws, the original error (with stack, status, provider-specific properties) must survive as error.cause.',
    pass:
      cause === originalError &&
      cause.status === 429 &&
      cause.providerCode === 'rate_limited',
    observed: {
      causeIsOriginalReference: cause === originalError,
      causeName: cause?.name,
      causeStatus: cause?.status,
      causeProviderCode: cause?.providerCode,
    },
  }
}

async function scenario4_toolsFieldOmitted(): Promise<ScenarioResult> {
  let observedTools: unknown = 'NOT_CALLED'
  const inspector: ChatMiddleware = {
    name: 'inspector',
    onStructuredOutputConfig(_ctx, config) {
      observedTools = (config as { tools?: unknown }).tools
    },
  }

  const adapter = buildStreamingAdapter({})
  await chat({
    adapter,
    messages: [{ role: 'user', content: 'extract' }],
    outputSchema: PersonSchema,
    middleware: [inspector],
  })

  return {
    id: 'important-2',
    title: 'Important #2 — tools field absent from StructuredOutputMiddlewareConfig',
    description:
      'Middleware reading `config.tools` from onStructuredOutputConfig must observe `undefined` — the field was removed structurally because the engine never forwards it to the structured-output adapter call.',
    pass: observedTools === undefined,
    observed: { toolsAtHookTime: observedTools },
  }
}

export const Route = createFileRoute('/api/verify-pr600')({
  server: {
    handlers: {
      POST: async () => {
        const results: Array<ScenarioResult> = []
        for (const fn of [
          scenario1_noToolsDoubleCall,
          scenario2_validationIssuesPreserved,
          scenario3_fallbackErrorPreservation,
          scenario4_toolsFieldOmitted,
        ]) {
          try {
            results.push(await fn())
          } catch (e) {
            results.push({
              id: fn.name,
              title: fn.name,
              description: 'Scenario itself threw — unexpected.',
              pass: false,
              observed: {
                threw: true,
                message: e instanceof Error ? e.message : String(e),
              },
            })
          }
        }
        return new Response(
          JSON.stringify({
            results,
            allPass: results.every((r) => r.pass),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
