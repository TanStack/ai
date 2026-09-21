import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  choice,
  decide,
  toServerSentEventsResponse,
  type ModelMessage,
  type SubagentChoiceOptions,
  type UIMessage,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { typesafeDecider } from '@tanstack/ai-typesafe'
import { createBlogAgents } from '@/lib/agents'

const jev = typesafeDecider('jev-latest')

function lastUserText(messages: Array<UIMessage | ModelMessage>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    if ('content' in message && typeof message.content === 'string') {
      return message.content
    }
    if ('parts' in message && Array.isArray(message.parts)) {
      return message.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('content' in part ? part.content : ''))
        .join('')
    }
  }
  return ''
}

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
      sandbox: 'own',
      router: async ({ messages }) => {
        const result = await decide({
          adapter: jev,
          state: { text: lastUserText(messages) },
          questions: {
            target: choice({
              instructions:
                'Who must handle this turn for a blog-writing desk?',
              options: {
                main: 'General chat, greetings, or a mixed question',
                researcher: agents[0].description,
                writer: agents[1].description,
              } satisfies SubagentChoiceOptions<typeof agents>,
            }),
          },
        })
        const pick = result.target.value
        if (pick === 'main' || pick === 'researcher' || pick === 'writer') {
          return pick
        }
        return 'main'
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
