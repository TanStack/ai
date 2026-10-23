import { createFileRoute } from '@tanstack/react-router'
import { agentLoop } from '@earendil-works/pi-agent-core'
import {
  Type,
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import {
  chatParamsFromRequest,
  convertMessagesToModelMessages,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fromPiAgentEvents, toPiMessages } from '@tanstack/ai-pi-stream'
import type { AgentTool } from '@earendil-works/pi-agent-core'

const parameters = Type.Object({ city: Type.String() })

const getWeather: AgentTool<typeof parameters> = {
  name: 'getWeather',
  label: 'Weather',
  description: 'Get the weather for a city',
  parameters,
  execute: (_id, { city }) =>
    Promise.resolve({
      content: [{ type: 'text', text: `sunny in ${city}` }],
      details: undefined,
    }),
}

// A pi agent loop that TanStack `useChat` reads. No network: pi's faux model
// calls `getWeather`, then answers with the tool result.
export const Route = createFileRoute('/api/pi-agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, threadId, runId } =
          await chatParamsFromRequest(request)
        const history = toPiMessages(convertMessagesToModelMessages(messages))
        const prompt = history.pop()

        const faux = createFauxCore({})
        faux.setResponses([
          fauxAssistantMessage(
            fauxToolCall('getWeather', { city: 'Oslo' }, { id: 'call-1' }),
            { stopReason: 'toolUse' },
          ),
          (context) => {
            const result = context.messages.at(-1)
            const text =
              result?.role === 'toolResult' &&
              result.content[0]?.type === 'text'
                ? result.content[0].text
                : ''
            return fauxAssistantMessage(`Tool said: ${text}`)
          },
        ])

        const events = agentLoop(
          prompt ? [prompt] : [],
          { messages: history, tools: [getWeather] },
          { model: faux.getModel(), convertToLlm: (piMessages) => piMessages },
          request.signal,
          (model, context, options) =>
            faux.streamSimple(model, context, options),
        )
        return toServerSentEventsResponse(
          fromPiAgentEvents(events, { threadId, runId }),
        )
      },
    },
  },
})
