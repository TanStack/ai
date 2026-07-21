import {
  EventType,
  canonicalInterruptJson,
  chat,
  chatParamsFromRequestBody,
  digestInterruptJson,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { z } from 'zod'
import { interruptLabScenarios, isInterruptLabScenarioId } from './scenarios'
import type { AnyTextAdapter, ChatMiddleware, StreamChunk } from '@tanstack/ai'
import type {
  InterruptLabMode,
  InterruptLabScenario,
  InterruptLabScenarioId,
} from './scenarios'

export type InterruptLabChatOptions = Parameters<typeof chat>[0]

export interface InterruptLabRouteDependencies {
  runChat: (options: InterruptLabChatOptions) => AsyncIterable<StreamChunk>
  toResponse: (stream: AsyncIterable<StreamChunk>) => Response
  createAdapter: (model: 'gpt-5.5', apiKey: string) => AnyTextAdapter
  readApiKey: () => string | undefined
  logError?: (entry: InterruptLabSafeLogEntry) => void
}

export interface InterruptLabSafeLogEntry {
  event: 'interrupt-lab-run-failed'
  mode: InterruptLabMode
  scenarioId: InterruptLabScenarioId
}

const INTERRUPT_LAB_ERROR_MESSAGE = 'Interrupt lab run failed.'
const INTERRUPT_LAB_ERROR_CODE = 'interrupt-lab-run-failed'
const deliberateResumeFailures = new Map<string, true>()
const MAX_DELIBERATE_RESUME_FAILURES = 128

export interface CreateInterruptLabPostOptions {
  mode: InterruptLabMode
  persistenceMiddleware?: ChatMiddleware
  dependencies?: InterruptLabRouteDependencies
}

const SYSTEM_PROMPT = `You are operating a manual interrupt API lab.
Follow the scenario instruction exactly. Never substitute a different tool,
never skip a requested tool, and make simultaneous calls in one assistant turn
when the scenario asks for a batch.`

const defaultDependencies: InterruptLabRouteDependencies = {
  runChat: (options) => chat(options) as AsyncIterable<StreamChunk>,
  toResponse: (stream) => toServerSentEventsResponse(stream),
  createAdapter: (model, apiKey) => createOpenaiChat(model, apiKey),
  readApiKey: () => process.env.OPENAI_API_KEY,
  logError: (entry) => console.error('[interrupt-lab] request failed', entry),
}

type GenericInterruptLabScenario = InterruptLabScenario & {
  genericResponseSchema: NonNullable<
    InterruptLabScenario['genericResponseSchema']
  >
}

function genericInterruptId(interruptedRunId: string): string {
  return `interrupt_lab_generic_${interruptedRunId}`
}

function safeInterruptLabError(): Error {
  const error = new Error(INTERRUPT_LAB_ERROR_MESSAGE)
  Object.defineProperty(error, 'code', {
    value: INTERRUPT_LAB_ERROR_CODE,
    enumerable: true,
  })
  return error
}

function safeInterruptLabRunError({
  threadId,
  runId,
  source,
}: {
  threadId: string
  runId: string
  source?: Extract<StreamChunk, { type: 'RUN_ERROR' }>
}): Extract<StreamChunk, { type: 'RUN_ERROR' }> {
  // Preserve structured interrupt validation errors and surface their first
  // message so the lab can debug resume failures (generic "run failed" alone
  // hides unknown-interrupt / incomplete-batch).
  const interruptErrors = source?.['tanstack:interruptErrors']
  const interruptMessage =
    Array.isArray(interruptErrors) &&
    interruptErrors[0] &&
    typeof interruptErrors[0] === 'object' &&
    'message' in interruptErrors[0] &&
    typeof interruptErrors[0].message === 'string'
      ? interruptErrors[0].message
      : undefined
  return {
    type: EventType.RUN_ERROR,
    threadId,
    runId,
    timestamp: Date.now(),
    message: interruptMessage ?? INTERRUPT_LAB_ERROR_MESSAGE,
    code:
      interruptMessage !== undefined
        ? typeof interruptErrors?.[0] === 'object' &&
          interruptErrors[0] !== null &&
          'code' in interruptErrors[0] &&
          typeof interruptErrors[0].code === 'string'
          ? interruptErrors[0].code
          : INTERRUPT_LAB_ERROR_CODE
        : INTERRUPT_LAB_ERROR_CODE,
    ...(interruptErrors !== undefined
      ? { 'tanstack:interruptErrors': interruptErrors }
      : {}),
    ...(source?.['tanstack:interruptRecovery'] !== undefined
      ? { 'tanstack:interruptRecovery': source['tanstack:interruptRecovery'] }
      : {}),
  }
}

function createInterruptLabErrorSanitizerMiddleware(): ChatMiddleware {
  return {
    name: 'interrupt-lab-error-sanitizer',
    onChunk(ctx, chunk) {
      if (chunk.type !== EventType.RUN_ERROR) return
      return safeInterruptLabRunError({
        threadId: ctx.threadId,
        runId: ctx.runId,
        source: chunk,
      })
    },
    onError(_ctx, info) {
      // Hooks run in array order and ErrorInfo is intentionally mutable. This
      // replaces provider details before durable persistence observes them.
      info.error = safeInterruptLabError()
    },
  }
}

function logInterruptLabFailure(
  logError: InterruptLabRouteDependencies['logError'],
  entry: InterruptLabSafeLogEntry,
): void {
  try {
    logError?.(entry)
  } catch {
    // Observability must never alter stream termination or public responses.
  }
}

function sanitizeInterruptLabStream({
  stream,
  threadId,
  runId,
  logError,
  logEntry,
}: {
  stream: AsyncIterable<StreamChunk>
  threadId: string
  runId: string
  logError: InterruptLabRouteDependencies['logError']
  logEntry: InterruptLabSafeLogEntry
}): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const chunk of stream) {
          if (chunk.type === EventType.RUN_ERROR) {
            logInterruptLabFailure(logError, logEntry)
            yield safeInterruptLabRunError({
              threadId,
              runId,
              source: chunk,
            })
            return
          }
          yield chunk
        }
      } catch {
        logInterruptLabFailure(logError, logEntry)
        yield safeInterruptLabRunError({ threadId, runId })
      }
    },
  }
}

/**
 * Models an external AG-UI generic interrupt at the stream boundary.
 *
 * The OpenAI request still runs normally. Only its final success terminal is
 * replaced, and only for the dedicated generic scenario. This is deliberately
 * not represented as a TanStack tool interrupt.
 */
export function createGenericInterruptMiddleware({
  scenario,
  mode,
}: {
  scenario: GenericInterruptLabScenario
  mode: InterruptLabMode
}): ChatMiddleware {
  const responseSchema = scenario.genericResponseSchema
  // The library no longer validates a generic interrupt's wire schema, so the
  // application validates the resolved value itself. Here we transform the JSON
  // Schema with zod and check the payload before trusting it. The scenario's
  // schema is typed as a precise literal; widen it to zod's JSON Schema input.
  const responseValidator = z.fromJSONSchema(
    responseSchema as Parameters<typeof z.fromJSONSchema>[0],
  )
  const responseSchemaHash = digestInterruptJson(
    canonicalInterruptJson(responseSchema),
  )
  let isContinuation = false

  return {
    name: 'interrupt-lab-generic-boundary',
    onConfig(ctx, config) {
      if (ctx.phase !== 'init' || (config.resume?.length ?? 0) === 0) {
        return
      }

      isContinuation = true
      const interruptedRunId = ctx.parentRunId
      if (!interruptedRunId) {
        throw new Error(
          'Generic interrupt continuation requires parentRunId correlation.',
        )
      }
      const expectedId = genericInterruptId(interruptedRunId)
      if (
        config.resume?.length !== 1 ||
        config.resume[0]?.interruptId !== expectedId
      ) {
        throw new Error(
          `Generic interrupt continuation must resolve only ${expectedId}.`,
        )
      }

      const resolution = config.resume[0]
      let resolutionPrompt: string
      if (resolution.status === 'cancelled') {
        resolutionPrompt =
          'The user cancelled the generic interrupt. Acknowledge the cancellation briefly.'
      } else {
        const parsed = responseValidator.safeParse(resolution.payload)
        if (!parsed.success) {
          const issueSummary = parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join('.') || '<root>'}: ${issue.message}`,
            )
            .join('; ')
          throw new Error(`Invalid generic interrupt payload: ${issueSummary}`)
        }
        resolutionPrompt = `The user resolved the generic interrupt with this validated payload: ${JSON.stringify(parsed.data)}. Acknowledge it briefly.`
      }

      return {
        messages: [
          ...config.messages,
          {
            role: 'user',
            content: resolutionPrompt,
          },
        ],
        ...(mode === 'ephemeral' ? { resume: undefined } : {}),
      }
    },
    onChunk(ctx, chunk) {
      if (
        isContinuation ||
        chunk.type !== EventType.RUN_FINISHED ||
        (chunk.outcome !== undefined && chunk.outcome.type !== 'success')
      ) {
        return
      }

      // Correlate against the terminal's run id (what the client will send as
      // parentRunId), not middleware ctx.runId — adapters may emit a provider
      // run id that differs from the client request run id.
      const interruptedRunId =
        typeof chunk.runId === 'string' && chunk.runId.length > 0
          ? chunk.runId
          : ctx.runId
      const interruptId = genericInterruptId(interruptedRunId)
      return {
        ...chunk,
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: interruptId,
              reason: 'interrupt_lab:generic_question',
              message: 'Provide a typed answer for the generic AG-UI question.',
              responseSchema,
              metadata: {
                kind: 'generic',
                'tanstack:interruptBinding': {
                  kind: 'generic',
                  interruptId,
                  interruptedRunId,
                  generation: 0,
                  responseSchemaHash,
                },
              },
            },
          ],
        },
      }
    },
  }
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function maybeFailDurableResumeOnce({
  mode,
  threadId,
  parentRunId,
  resumeCount,
  enabled,
}: {
  mode: InterruptLabMode
  threadId: string
  parentRunId?: string
  resumeCount: number
  enabled: boolean
}): Response | undefined {
  if (mode !== 'durable' || resumeCount === 0 || parentRunId === undefined) {
    return undefined
  }

  const key = `${threadId}:${parentRunId}`
  if (!enabled) {
    deliberateResumeFailures.delete(key)
    return undefined
  }
  if (deliberateResumeFailures.delete(key)) return undefined
  deliberateResumeFailures.set(key, true)
  while (deliberateResumeFailures.size > MAX_DELIBERATE_RESUME_FAILURES) {
    const oldestKey = deliberateResumeFailures.keys().next().value
    if (oldestKey === undefined) break
    deliberateResumeFailures.delete(oldestKey)
  }
  return new Response(
    JSON.stringify({
      error: 'Deliberate interrupt lab resume failure. Retry is safe.',
      retryable: true,
    }),
    {
      status: 503,
      headers: { 'content-type': 'application/json' },
    },
  )
}

export function createInterruptLabPost({
  mode,
  persistenceMiddleware,
  dependencies = defaultDependencies,
}: CreateInterruptLabPostOptions): (request: Request) => Promise<Response> {
  if (mode === 'durable' && persistenceMiddleware === undefined) {
    throw new TypeError(
      'Durable interrupt lab requires persistence middleware.',
    )
  }

  return async (request) => {
    if (request.signal.aborted) return new Response(null, { status: 499 })

    let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
    try {
      params = await chatParamsFromRequestBody(await request.json())
    } catch (error) {
      return jsonError(
        400,
        error instanceof Error ? error.message : 'Invalid AG-UI request body.',
      )
    }

    const scenarioId = params.forwardedProps.interruptScenario
    if (!isInterruptLabScenarioId(scenarioId)) {
      return jsonError(400, 'Unknown interrupt lab scenario.')
    }
    const scenario: InterruptLabScenario = interruptLabScenarios[scenarioId]
    if (!scenario.modes.some((supportedMode) => supportedMode === mode)) {
      return jsonError(
        400,
        `Scenario ${scenarioId} does not support ${mode} mode.`,
      )
    }

    const apiKey = dependencies.readApiKey()
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      return jsonError(
        500,
        'OPENAI_API_KEY is required for the interrupt lab. Set it and restart the dev server.',
      )
    }

    const deliberateFailure = maybeFailDurableResumeOnce({
      mode,
      threadId: params.threadId,
      ...(params.parentRunId !== undefined
        ? { parentRunId: params.parentRunId }
        : {}),
      resumeCount: params.resume?.length ?? 0,
      enabled: params.forwardedProps.interruptLabFailResumeOnce === true,
    })
    if (deliberateFailure !== undefined) return deliberateFailure

    const abortController = new AbortController()
    request.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })

    try {
      const middleware: Array<ChatMiddleware> = [
        createInterruptLabErrorSanitizerMiddleware(),
      ]
      if (scenario.genericResponseSchema !== undefined) {
        middleware.push(
          createGenericInterruptMiddleware({
            scenario: {
              ...scenario,
              genericResponseSchema: scenario.genericResponseSchema,
            },
            mode,
          }),
        )
      }
      if (persistenceMiddleware !== undefined) {
        middleware.push(persistenceMiddleware)
      }

      const stream = dependencies.runChat({
        adapter: dependencies.createAdapter('gpt-5.5', apiKey),
        debug: params.forwardedProps.interruptLabDebug === true,
        messages: params.messages,
        tools: [...scenario.tools],
        systemPrompts: [SYSTEM_PROMPT, scenario.systemPrompt],
        agentLoopStrategy: maxIterations(8),
        middleware,
        metadata: {
          interruptLabMode: mode,
          interruptLabScenario: scenarioId,
        },
        threadId: params.threadId,
        runId: params.runId,
        parentRunId: params.parentRunId,
        state: params.state,
        resume: params.resume,
        abortController,
      })
      return dependencies.toResponse(
        sanitizeInterruptLabStream({
          stream,
          threadId: params.threadId,
          runId: params.runId,
          logError: dependencies.logError ?? defaultDependencies.logError,
          logEntry: {
            event: 'interrupt-lab-run-failed',
            mode,
            scenarioId,
          },
        }),
      )
    } catch {
      if (abortController.signal.aborted) {
        return new Response(null, { status: 499 })
      }
      logInterruptLabFailure(
        dependencies.logError ?? defaultDependencies.logError,
        {
          event: 'interrupt-lab-run-failed',
          mode,
          scenarioId,
        },
      )
      return jsonError(502, INTERRUPT_LAB_ERROR_MESSAGE)
    }
  }
}
