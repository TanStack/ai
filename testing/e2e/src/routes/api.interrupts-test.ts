import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  canonicalInterruptJson,
  chat,
  chatParamsFromRequestBody,
  digestInterruptJson,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { z } from 'zod'
import type { ChatMiddleware } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import {
  feedingScheduleResponseSchema,
  getServerToolsForScenario,
} from '@/lib/interrupt-scenario-tools'

/** The generic feeding interrupt id is derived from the run it pauses. */
export const feedingInterruptId = (runId: string): string => `feeding_${runId}`

// Constant continuation prompts keep aimock's userMessage matching stable
// (the payload is validated but not interpolated into the prompt text).
const FEEDING_CONFIRM_PROMPT =
  'The keeper set a feeding schedule. Confirm it briefly.'
const FEEDING_CANCEL_PROMPT =
  'The keeper cancelled the feeding schedule. Acknowledge briefly.'

/**
 * Emits the generic "feeding schedule" interrupt: a non-tool application
 * pause. On the first turn the plain success terminal is replaced with an
 * interrupt outcome carrying a wire responseSchema; on the continuation the
 * keeper's answer is validated here (the library does not validate generic
 * values) and a fixed confirmation prompt is appended.
 */
export function createFeedingMiddleware(): ChatMiddleware {
  const responseSchemaHash = digestInterruptJson(
    canonicalInterruptJson(feedingScheduleResponseSchema),
  )
  const validate = z.fromJSONSchema(
    feedingScheduleResponseSchema as unknown as Parameters<
      typeof z.fromJSONSchema
    >[0],
  )
  let isContinuation = false

  return {
    name: 'feeding-schedule',
    onConfig(ctx, config) {
      if (ctx.phase !== 'init' || (config.resume?.length ?? 0) === 0) return
      isContinuation = true
      const interruptedRunId = ctx.parentRunId
      if (!interruptedRunId) {
        throw new Error('Feeding continuation requires parentRunId.')
      }
      const expectedId = feedingInterruptId(interruptedRunId)
      const resolution = config.resume?.[0]
      if (
        config.resume?.length !== 1 ||
        resolution?.interruptId !== expectedId
      ) {
        throw new Error(`Feeding continuation must resolve only ${expectedId}.`)
      }

      let prompt: string
      if (resolution.status === 'cancelled') {
        prompt = FEEDING_CANCEL_PROMPT
      } else {
        const parsed = validate.safeParse(resolution.payload)
        if (!parsed.success) {
          throw new Error(
            `Invalid feeding schedule: ${parsed.error.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          )
        }
        prompt = FEEDING_CONFIRM_PROMPT
      }

      return {
        messages: [...config.messages, { role: 'user', content: prompt }],
        resume: undefined,
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
      // Correlate on the client's request run id (`ctx.runId`), which is what
      // the client sends back as `parentRunId` on the continuation.
      const interruptedRunId = ctx.runId
      const interruptId = feedingInterruptId(interruptedRunId)
      return {
        ...chunk,
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: interruptId,
              reason: 'sanctuary:feeding_schedule',
              message: 'Choose a feeding schedule for this animal.',
              responseSchema: feedingScheduleResponseSchema,
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

export const Route = createFileRoute('/api/interrupts-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal?.aborted) {
          return new Response(null, { status: 499 })
        }

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps
        const scenario = typeof fp.scenario === 'string' ? fp.scenario : 'admit'
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined
        const isGeneric = scenario === 'feeding'

        const abortController = new AbortController()

        try {
          const stream = chat({
            ...createTextAdapter('openai', undefined, aimockPort, testId),
            messages: params.messages,
            tools: getServerToolsForScenario(scenario),
            agentLoopStrategy: maxIterations(8),
            threadId: params.threadId,
            runId: params.runId,
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.resume ? { resume: params.resume } : {}),
            ...(isGeneric ? { middleware: [createFeedingMiddleware()] } : {}),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
