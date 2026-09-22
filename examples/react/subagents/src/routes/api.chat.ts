import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  decide,
  subagentRoute,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  createOpenRouterDecider,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createBlogAgents } from '@/lib/agents'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  const abortController = new AbortController()
  request.signal.addEventListener(
    'abort',
    () => {
      abortController.abort()
    },
    { once: true },
  )

  const agents = createBlogAgents(apiKey)
  const stream = chat({
    adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    abortController,
    subagents: {
      agents,
      strategy: 'exclusive',
      router: async ({ messages }) => {
        const route = subagentRoute(agents, {
          when: {
            researcher:
              'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft.',
            writer:
              'Does this turn need a written article, post, or rewrite? Answer yes even if they also ask for research.',
          },
        })
        const result = await decide({
          adapter: createOpenRouterDecider('~typesafe/jev-latest', apiKey),
          state: messages.at(-1),
          questions: route.questions,
        })
        return route.pick(result)
      },
    },
  })
  return toServerSentEventsResponse(stream, { abortController })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
