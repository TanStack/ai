import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { createMistralText } from '@tanstack/ai-mistral'
import { z } from 'zod'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * The first model call answers with one tool call and finishes with
 * `length` (the fixture in `fixtures/truncated-tool-call` sets
 * `finishReason: 'length'`). Mistral must keep `length` on `RUN_FINISHED`
 * instead of mapping it to `tool_calls`. The cut call never runs. aimock
 * sends complete JSON arguments, so the partial-JSON path is covered in
 * `packages/ai-mistral/tests/mistral-adapter.test.ts`.
 */
export const Route = createFileRoute('/api/mistral-truncated-tool-call')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createMistralText('mistral-large-latest', DUMMY_KEY, {
          baseURL: LLMOCK_DEFAULT_BASE,
        })
        let runs = 0
        const lookupWeather = toolDefinition({
          name: 'lookup_weather',
          description: 'Look up the weather.',
          inputSchema: z.object({ location: z.string() }),
        }).server(async () => {
          runs += 1
          return 'sunny'
        })

        let text = ''
        const toolResults: Array<unknown> = []
        const finishReasons: Array<string | undefined> = []
        let runError: string | undefined
        try {
          for await (const chunk of chat({
            threadId: 'mistral-truncated-tool-call',
            ...createChatOptions({ adapter }),
            tools: [lookupWeather],
            messages: [
              {
                role: 'user',
                content: '[truncated-tool-call] weather in Paris',
              },
            ],
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'TOOL_CALL_RESULT') {
              toolResults.push(chunk.content)
            }
            if (chunk.type === 'RUN_FINISHED') {
              const tanstack = chunk.metadata?.tanstack
              finishReasons.push(
                tanstack &&
                  typeof tanstack === 'object' &&
                  'finishReason' in tanstack &&
                  typeof tanstack.finishReason === 'string'
                  ? tanstack.finishReason
                  : undefined,
              )
            }
            if (chunk.type === 'RUN_ERROR') runError = chunk.message
          }
          if (runError !== undefined) throw new Error(runError)
          return Response.json({
            ok: true,
            runs,
            toolResults,
            text,
            finishReasons,
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
