import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { createChatPersistence } from '@/lib/sqlite-persistence'

const SYSTEM_PROMPT = `You are a concise assistant in a durable chat demo.

Chat state (messages, run status, interrupts) is persisted via the state
middleware. Delivery durability for a transiently dropped active SSE connection
is handled by the transport helper's durability sink.
Keep answers short enough that the streaming behavior is easy to inspect.`

const persistence = createChatPersistence()

export const Route = createFileRoute('/api/sqlite-persistent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        // State durability: persist messages / run status / interrupts at
        // boundaries. This is lazy — the provider call only fires on the first
        // `for await` inside the transport helper.
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          middleware: [withChatPersistence(persistence)],
          systemPrompts: [SYSTEM_PROMPT],
          agentLoopStrategy: maxIterations(4),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.resume ? { resume: params.resume } : {}),
        })

        // Delivery durability: the sink appends each batch and tags every SSE
        // event with an opaque adapter-owned offset. The active client can
        // reconnect with Last-Event-ID and replay without re-invoking the
        // provider. `memoryStream` is the zero-infra dev default; swap in
        // `durableStream(request, { server })` for horizontally scaled
        // deployments.
        const durability = memoryStream(request)
        return toServerSentEventsResponse(stream, {
          durability: { adapter: durability, batch: 8 },
        })
      },
    },
  },
})
