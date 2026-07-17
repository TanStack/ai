import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { createChatPersistence } from '@/lib/sqlite-persistence'

const SYSTEM_PROMPT = `You are a concise assistant in a durable chat demo.

Chat state (messages, run status, interrupts) is persisted via the state
middleware.
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

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
