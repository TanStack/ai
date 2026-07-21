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
import { createOpenaiChat } from '@tanstack/ai-openai'
import { z } from 'zod'
import {
  admitRescue,
  assignEnclosure,
  feedingScheduleResponseSchema,
  finalizeAdoption,
  logFieldSighting,
  printCertificate,
  printIntakeTag,
  scheduleVetCheck,
  shareAdoptionStory,
} from '@/lib/interrupt-tools'
import type { ChatMiddleware } from '@tanstack/ai'

const SYSTEM_PROMPT =
  'You are the coordinator at Willowbrook Wildlife Sanctuary. When the keeper ' +
  'asks for an action, call exactly the tool that matches it with sensible ' +
  'arguments drawn from their message. When you confirm a completed action, ' +
  'describe it using the values in the tool result (which may differ from the ' +
  'original request if the keeper edited them). Keep spoken replies short.'

// Server tools run on the server once approved. The client tools are passed as
// bare definitions so the server pauses on them (client-tool-execution) and the
// browser runs them after approval.
const tools = [
  admitRescue.server(async ({ name }) => ({
    intakeId: `intake_${name.toLowerCase()}`,
    status: 'admitted to intake ward',
  })),
  scheduleVetCheck.server(async ({ animal, urgency }) => ({
    visitId: `visit_${animal.toLowerCase()}_${urgency}`,
  })),
  finalizeAdoption.server(async ({ animal, adopter }) => ({
    certificateId: `cert_${animal.toLowerCase()}_${adopter.split(' ')[0]?.toLowerCase() ?? 'home'}`,
  })),
  assignEnclosure.server(async ({ animal, enclosure, sizeSqm }) => ({
    assignmentId: `${enclosure.toLowerCase()}_${animal.toLowerCase()}`,
    enclosure,
    sizeSqm,
  })),
  printIntakeTag,
  logFieldSighting,
  shareAdoptionStory,
  printCertificate,
]

export const feedingInterruptId = (runId: string): string => `feeding_${runId}`

/**
 * Decide the provider tool_choice for a run. Only the FIRST turn is shaped:
 * a button may force one tool, or the generic scenario forbids tools ('none').
 * A continuation (resume) never forces a choice, otherwise the model would
 * re-call the approved tool instead of answering.
 */
export function resolveToolChoice(input: {
  isResume: boolean
  generic?: boolean
  forceTool?: string
}): 'none' | { type: 'function'; name: string } | undefined {
  if (input.isResume) return undefined
  if (input.generic) return 'none'
  if (typeof input.forceTool === 'string') {
    return { type: 'function', name: input.forceTool }
  }
  return undefined
}

/**
 * Emits the generic "feeding schedule" interrupt: a non-tool application pause.
 * The plain success terminal of the run is replaced with an interrupt outcome
 * carrying a wire responseSchema, and on the continuation the keeper's answer is
 * validated here (the library does not validate generic values) and appended.
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
    name: 'sanctuary-feeding-schedule',
    onConfig(ctx, config) {
      if (ctx.phase !== 'init' || (config.resume?.length ?? 0) === 0) return
      isContinuation = true
      const interruptedRunId = ctx.parentRunId
      if (!interruptedRunId) {
        throw new Error('Feeding continuation requires parentRunId.')
      }
      const expectedId = feedingInterruptId(interruptedRunId)
      const resolution = config.resume?.[0]
      if (config.resume?.length !== 1 || resolution?.interruptId !== expectedId) {
        throw new Error(`Feeding continuation must resolve only ${expectedId}.`)
      }

      let prompt: string
      if (resolution.status === 'cancelled') {
        prompt = 'The keeper cancelled the feeding schedule. Acknowledge briefly.'
      } else {
        const parsed = validate.safeParse(resolution.payload)
        if (!parsed.success) {
          throw new Error(
            `Invalid feeding schedule: ${parsed.error.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          )
        }
        prompt = `The keeper set this feeding schedule: ${JSON.stringify(parsed.data)}. Confirm it briefly.`
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
      // the client sends back as `parentRunId` on the continuation. A provider
      // may stamp `chunk.runId` with its own id (e.g. `openai-…`) that differs.
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

async function handle(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'Set OPENAI_API_KEY in examples/ts-react-chat/.env',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }

  let params
  try {
    params = await chatParamsFromRequestBody(await request.json())
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad request', {
      status: 400,
    })
  }

  const forwarded = params.forwardedProps as {
    forceTool?: string
    generic?: boolean
  }
  const abortController = new AbortController()

  const toolChoice = resolveToolChoice({
    isResume: (params.resume?.length ?? 0) > 0,
    generic: forwarded.generic,
    forceTool: forwarded.forceTool,
  })

  const stream = chat({
    adapter: createOpenaiChat('gpt-5.5', apiKey),
    messages: params.messages,
    tools,
    systemPrompts: [SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(8),
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    ...(forwarded.generic ? { middleware: [createFeedingMiddleware()] } : {}),
    ...(toolChoice !== undefined
      ? { modelOptions: { tool_choice: toolChoice } }
      : {}),
    abortController,
  })

  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/interrupts')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
})
