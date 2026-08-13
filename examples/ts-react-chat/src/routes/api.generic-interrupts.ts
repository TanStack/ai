import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import {
  chooseAudience,
  inspectPlan,
  playgroundInterrupts,
  readPlaygroundForwarded,
  reviewPlan,
} from '@/lib/generic-interrupt-playground'
import type {
  ChatMiddleware,
  InterruptBoundaryPhase,
  InterruptToolResume,
} from '@tanstack/ai'

const SYSTEM_PROMPT =
  'You are a planning assistant. When the user asks you to inspect a plan, ' +
  'call inspectPlan with the plan id from their message. Keep spoken replies short.'

function createLifecycleMiddleware(
  boundary: InterruptBoundaryPhase,
  policy: InterruptToolResume,
): ChatMiddleware<unknown, (typeof playgroundInterrupts)[number]> {
  return {
    name: 'generic-interrupt-playground',
    onInterruptBoundary(ctx) {
      if (ctx.phase !== boundary || ctx.parentRunId) return
      return {
        interrupts: [
          reviewPlan.interrupt({
            key: `${boundary}-review`,
            reason: 'review_required',
            message: `Review the plan at ${ctx.phase}.`,
            payload: {
              title: 'Playground review plan',
              boundary: ctx.phase,
            },
          }),
          chooseAudience.interrupt({
            key: `${boundary}-audience`,
            reason: 'audience_required',
            message: 'Pick who this reply is for.',
            payload: {
              question: 'Who should the next reply speak to?',
              options: ['students', 'staff', 'mixed'],
            },
          }),
        ],
      }
    },
    onInterruptResolution(_ctx, resolutions) {
      for (const resolution of resolutions.for(reviewPlan)) {
        if (resolution.status === 'resolved' && !resolution.response.approved) {
          return { toolResume: 'stop' }
        }
      }
      return { toolResume: policy }
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
    return new Response(
      error instanceof Error ? error.message : 'Bad request',
      { status: 400 },
    )
  }

  const { boundary, policy } = readPlaygroundForwarded(params.forwardedProps)
  const isResume = (params.resume?.length ?? 0) > 0
  const needsTool = boundary === 'beforeTools' || boundary === 'afterTools'
  const tools = needsTool
    ? [
      inspectPlan.server(async ({ planId }) => ({
        inspected: true,
        planId,
      })),
    ]
    : []
  const abortController = new AbortController()

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
    ...(params.state ? { state: params.state } : {}),
    interrupts: playgroundInterrupts,
    middleware: [createLifecycleMiddleware(boundary, policy)],
    ...(!isResume && needsTool
      ? {
        modelOptions: {
          tool_choice: { type: 'function', name: inspectPlan.name },
        },
      }
      : {}),
    abortController,
  })

  return toServerSentEventsResponse(stream, { abortController })
}

export const Route = createFileRoute('/api/generic-interrupts')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
})
