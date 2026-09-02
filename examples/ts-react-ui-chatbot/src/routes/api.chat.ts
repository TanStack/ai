import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { BUDGET_OPTIONS, chooseBudget } from '@/chat/interrupts'
import { itinerarySchema } from '@/chat/schema'
import { bookStay, confirmPayment, lookupPlace } from '@/chat/tools'
import type { ChatMiddleware } from '@tanstack/ai'

const SYSTEM_PROMPT =
  'You are a concise trip desk. Use lookupPlace for city facts. ' +
  'Use bookStay when the user wants a hotel. ' +
  'When the user asks to pay, charge, or hold a payment, you must call confirmPayment. ' +
  'confirmPayment is a demo hold, not a real card charge. Do not refuse that tool. ' +
  'If the user sends a photo, name the place if you can and suggest a stay. ' +
  'If the user sends a PDF, read the trip facts and help from those facts. ' +
  'After you have enough, fill the itinerary structured output. ' +
  'Keep spoken replies short.'

const tools = [
  lookupPlace.server(async ({ city }) => ({
    city,
    blurb: `${city} rewards a slow walk and one long lunch.`,
    sources: [
      {
        title: `${city} overview`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(city)}`,
      },
    ],
  })),
  bookStay.server(async ({ city, nights }) => ({
    ok: true,
    confirmation: `Held ${nights} night(s) in ${city}`,
  })),
  confirmPayment.server(async ({ city, amount }) => ({
    ok: true,
    receipt: `Held $${amount} for ${city}`,
  })),
]

const budgetMiddleware: ChatMiddleware<unknown, typeof chooseBudget> = {
  name: 'choose-budget',
  onInterruptBoundary(ctx) {
    if (ctx.phase !== 'beforeModel' || ctx.parentRunId) return
    const userTurns = ctx.messages.filter((message) => message.role === 'user')
    if (userTurns.length !== 1) return
    return {
      interrupts: [
        chooseBudget.interrupt({
          key: 'budget',
          reason: 'budget_required',
          message: 'Pick a budget before the desk writes.',
          payload: {
            city: 'this trip',
            options: [...BUDGET_OPTIONS],
          },
        }),
      ],
    }
  },
}

function readModel(forwarded: unknown): 'gpt-5.5' | 'gpt-5.2' {
  if (
    typeof forwarded === 'object' &&
    forwarded !== null &&
    'model' in forwarded &&
    (forwarded.model === 'gpt-5.5' || forwarded.model === 'gpt-5.2')
  ) {
    return forwarded.model
  }
  return 'gpt-5.5'
}

async function handle(request: Request): Promise<Response> {
  const apiKey = getByokKey(request, openaiByok)
  if (!apiKey) return byokMissing(openaiByok)

  let params
  try {
    params = await chatParamsFromRequestBody(await request.json())
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Bad request',
      { status: 400 },
    )
  }

  const model = readModel(params.forwardedProps)
  const stream = chat({
    adapter: createOpenaiChat(model, apiKey),
    messages: params.messages,
    tools,
    interrupts: [chooseBudget],
    outputSchema: itinerarySchema,
    stream: true,
    systemPrompts: [SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(8),
    middleware: [budgetMiddleware],
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
  })

  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
})
