import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { z } from 'zod'
import type { FakeResponse, FakeResponseStep } from '@tanstack/ai/testing'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => `sunny in ${city}`)

const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  inputSchema: z.object({ path: z.string() }),
  needsApproval: true,
}).server(({ path }) => `deleted ${path}`)

// No `.server()`: the AI SDK page runs it in `onToolCall`.
const getLocation = toolDefinition({
  name: 'getLocation',
  description: 'The location of the user',
  inputSchema: z.object({}),
})

/** The first model call of each scenario, picked by the user message. */
function firstAnswer(prompt: string): FakeResponse {
  if (prompt.startsWith('Delete'))
    return { toolCalls: [{ name: 'deleteFile', input: { path: 'a.txt' } }] }
  if (prompt.startsWith('[error]')) return { error: 'The model is down' }
  if (prompt.startsWith('[client-tool]'))
    return { toolCalls: [{ name: 'getLocation', input: {} }] }
  return { toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }] }
}

// A plain TanStack `chat()` route, as TanStack `useChat` calls it. It has no
// AI SDK code: the AI SDK page converts in the browser with `toChatTransport`.
export const Route = createFileRoute('/api/ai-sdk-client-bridge')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        // The AG-UI request has the text in `content`.
        const first = params.messages.find((m) => m.role === 'user')
        const prompt =
          first && 'content' in first && typeof first.content === 'string'
            ? first.content
            : ''
        const fake = fakeText()
        const step: FakeResponseStep = ({ request: model }) => {
          const last = model.messages.at(-1)
          return last?.role === 'tool'
            ? { text: `Tool said: ${String(last.content)}` }
            : firstAnswer(prompt)
        }
        fake.setResponses([step, step])
        return toServerSentEventsResponse(
          chat({
            ...params,
            adapter: fake,
            tools: [getWeather, deleteFile, getLocation],
          }),
        )
      },
    },
  },
})
