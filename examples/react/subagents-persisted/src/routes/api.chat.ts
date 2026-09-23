import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  decide,
  memoryStream,
  resumeServerSentEventsResponse,
  subagentRoute,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import {
  createOpenRouterDecider,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createBlogAgents } from '@/lib/agents'

const FIRST_CHUNK_MS = 30_000

const persistence = memoryPersistence()

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        // The id reads only the header. The provider object would also read
        // OPENROUTER_API_KEY, and this example has no login.
        const apiKey = getByokKey(request, openrouterByok.id)
        if (!apiKey) return byokMissing(openrouterByok)
        const agents = createBlogAgents(apiKey)
        const stream = chat({
          adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          middleware: [withPersistence(persistence)],
          ...(params.parentRunId !== undefined
            ? { parentRunId: params.parentRunId }
            : {}),
          ...(params.resume !== undefined ? { resume: params.resume } : {}),
          subagents: {
            agents,
            strategy: 'exclusive',
            router: async ({ messages, agents: routed, abortSignal }) => {
              const state = messages.at(-1)
              if (state === undefined) return 'main'
              const route = subagentRoute(routed, { then: ['writer'] })
              const result = await decide({
                adapter: createOpenRouterDecider(
                  '~typesafe/jev-latest',
                  apiKey,
                ),
                state,
                questions: route.questions,
                abortSignal,
              })
              return route.pick(result)
            },
          },
        })
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },
      GET: ({ request }) => {
        const durability = memoryStream(request, {
          firstChunkDeadlineMs: FIRST_CHUNK_MS,
        })
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return reconstructChat(persistence, request)
      },
    },
  },
})
