import type { RequestHandler } from '@qwik.dev/router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const SYSTEM_PROMPT = `You are a concise assistant helping test the TanStack AI Qwik adapter.
Explain streaming, Qwik, and TanStack AI concepts clearly.`

export const onPost: RequestHandler = async ({ json, request, send }) => {
  if (!process.env.OPENAI_API_KEY) {
    json(500, {
      error:
        'OPENAI_API_KEY not configured. Please add it to .env or .env.local',
    })
    return
  }

  const requestSignal = request.signal
  if (requestSignal?.aborted) {
    send(new Response(null, { status: 499 }))
    return
  }

  const abortController = new AbortController()

  let params
  try {
    params = await chatParamsFromRequestBody(await request.json())
  } catch (error) {
    send(
      new Response(error instanceof Error ? error.message : 'Bad request', {
        status: 400,
      }),
    )
    return
  }

  try {
    const stream = chat({
      adapter: openaiText('gpt-5.2'),
      systemPrompts: [SYSTEM_PROMPT],
      agentLoopStrategy: maxIterations(5),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      abortController,
    })

    send(toServerSentEventsResponse(stream, { abortController }))
    return
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || abortController.signal.aborted)
    ) {
      send(new Response(null, { status: 499 }))
      return
    }

    json(500, {
      error: error instanceof Error ? error.message : 'An error occurred',
    })
  }
}
