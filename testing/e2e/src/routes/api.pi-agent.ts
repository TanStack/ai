import { createFileRoute } from '@tanstack/react-router'
import {
  Type,
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { runPiAgent } from '@tanstack/ai-pi-stream'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TranscriptContext } from '@earendil-works/pi-ai'

type PiContext = TranscriptContext

const cityParams = Type.Object({ city: Type.String() })
const pathParams = Type.Object({ path: Type.String() })

const getWeather: AgentTool<typeof cityParams> = {
  name: 'getWeather',
  label: 'Weather',
  description: 'Get the weather for a city',
  parameters: cityParams,
  execute: (_id, { city }) =>
    Promise.resolve({
      content: [{ type: 'text', text: `sunny in ${city}` }],
      details: undefined,
    }),
}

const deleteFile: AgentTool<typeof pathParams> = {
  name: 'deleteFile',
  label: 'Delete',
  description: 'Delete a file',
  parameters: pathParams,
  execute: (_id, { path }) =>
    Promise.resolve({
      content: [{ type: 'text', text: `deleted ${path}` }],
      details: undefined,
    }),
}

// A pi agent that TanStack `useChat` reads. No network: pi's faux model calls
// a tool, then answers with the tool result. A prompt that starts with
// "Delete" calls `deleteFile`, which needs approval.
export const Route = createFileRoute('/api/pi-agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)

        // One answer per model call: the tool result as text, else a tool call.
        const answer = (context: PiContext) => {
          // pi adds a system message on continue, so find the result.
          const result = [...context.messages]
            .reverse()
            .find((message) => message.role === 'toolResult')
          if (result?.role === 'toolResult') {
            const first = result.content[0]
            return fauxAssistantMessage(
              `Tool said: ${first?.type === 'text' ? first.text : ''}`,
            )
          }
          const prompt = JSON.stringify(
            context.messages[context.messages.length - 1] ?? '',
          )
          return fauxAssistantMessage(
            prompt.includes('Delete')
              ? fauxToolCall('deleteFile', { path: 'a.txt' }, { id: 'call-1' })
              : fauxToolCall('getWeather', { city: 'Oslo' }, { id: 'call-1' }),
            { stopReason: 'toolUse' },
          )
        }
        const faux = createFauxCore({})
        faux.setResponses([answer, answer])

        return toServerSentEventsResponse(
          runPiAgent(params, {
            config: {
              model: faux.getModel(),
              convertToLlm: (piMessages) => piMessages,
            },
            streamFn: (model, context, options) =>
              faux.streamSimple(model, context, options),
            tools: [getWeather, deleteFile],
            needsApproval: ['deleteFile'],
            signal: request.signal,
          }),
        )
      },
    },
  },
})
