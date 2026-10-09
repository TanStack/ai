import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { BedrockConverseTextAdapter } from '@tanstack/ai-bedrock'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { z } from 'zod'
import type { ResolvedBedrockAuth } from '@tanstack/ai-bedrock'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

/** HTTP/1.1, because aimock does not speak HTTP/2 (see the cache route). */
class Http1ConverseAdapter extends BedrockConverseTextAdapter<typeof MODEL> {
  protected override buildClientConfig(
    resolved: ResolvedBedrockAuth,
    region: string,
    endpoint: string | undefined,
  ) {
    return {
      ...super.buildClientConfig(resolved, region, endpoint),
      requestHandler: new NodeHttpHandler(),
    }
  }
}

/**
 * The answer of the first model call has one tool call and stops at
 * `max_tokens` (the fixture in `fixtures/truncated-tool-call` sets
 * `finishReason: 'length'`). Converse keeps the `length` finish with the
 * call. With `truncatedToolResult`, the call does not run, it gets the text
 * as its error result, and the model is called again.
 */
export const Route = createFileRoute(
  '/api/bedrock-converse-truncated-tool-call',
)({
  server: {
    handlers: {
      POST: async () => {
        const adapter = new Http1ConverseAdapter(
          {
            apiKey: DUMMY_KEY,
            baseURL: LLMOCK_DEFAULT_BASE,
            region: 'us-east-1',
          },
          MODEL,
        )
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
        let runError: string | undefined
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            tools: [lookupWeather],
            messages: [
              {
                role: 'user',
                content: '[truncated-tool-call] weather in Paris',
              },
            ],
            truncatedToolResult: ({ toolName }) =>
              `Tool call "${toolName}" was cut off. Send it again.`,
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'TOOL_CALL_RESULT') {
              toolResults.push(chunk.content)
            }
            if (chunk.type === 'RUN_ERROR') runError = chunk.message
          }
          if (runError !== undefined) throw new Error(runError)
          return Response.json({ ok: true, runs, toolResults, text })
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
