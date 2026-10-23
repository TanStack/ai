import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import {
  chatParamsFromAISDKRequest,
  toUIMessageStream,
} from '@tanstack/ai-ui-message-stream'
import { createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'
import type { FakeResponseStep } from '@tanstack/ai/testing'

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

const answerWithToolResult: FakeResponseStep = ({ request }) => ({
  text: `Tool said: ${String(request.messages.at(-1)?.content)}`,
})

// A TanStack `chat()` route that AI SDK `useChat` reads. No network:
// `fakeText` calls a server tool, then answers with the tool result. A user
// message that starts with "Delete" calls `deleteFile`, which needs approval;
// the approval answer comes back as a second request that resumes the run.
export const Route = createFileRoute('/api/ai-sdk-client')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromAISDKRequest(request)
        const lastUser = params.messages
          .filter((m) => m.role === 'user')
          .at(-1)
          ?.parts.flatMap((p) => (p.type === 'text' ? [p.content] : []))
          .join('')

        // A fake per request: pick the script from the request.
        const fake = fakeText()
        fake.setResponses(
          params.resume
            ? [answerWithToolResult]
            : lastUser?.startsWith('Delete')
              ? [
                  {
                    toolCalls: [
                      { name: 'deleteFile', input: { path: 'a.txt' } },
                    ],
                  },
                ]
              : [
                  {
                    toolCalls: [
                      { name: 'getWeather', input: { city: 'Oslo' } },
                    ],
                  },
                  answerWithToolResult,
                ],
        )

        return createUIMessageStreamResponse({
          stream: toUIMessageStream(
            chat({ adapter: fake, tools: [getWeather, deleteFile], ...params }),
          ),
        })
      },
    },
  },
})
