import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterResponsesText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

/**
 * Drives the OpenRouter Responses adapter against a stream that ends in
 * `response.failed` with an `error_type`. The companion spec asserts the type
 * reaches the `RUN_ERROR`.
 */
const failedEvent = {
  type: 'response.failed',
  sequence_number: 1,
  response: {
    id: 'gen-1',
    object: 'response',
    status: 'failed',
    output: [],
    error: { code: 'server_error', message: 'x' },
    error_type: 'provider_overloaded',
  },
}

export const Route = createFileRoute(
  '/api/openrouter-responses-error-type-wire',
)({
  server: {
    handlers: {
      POST: async () => {
        const httpClient = new HTTPClient({
          fetcher: async () =>
            new Response(
              `event: response.failed\ndata: ${JSON.stringify(failedEvent)}\n\n`,
              { headers: { 'content-type': 'text/event-stream' } },
            ),
        })
        const adapter = createOpenRouterResponsesText(
          'openai/gpt-4o',
          'sk-e2e-test-dummy-key',
          {
            httpClient,
          },
        )

        let code: string | undefined
        let errorType: string | undefined
        for await (const chunk of chat({
          threadId: 'openrouter-responses-error-type',
          ...createChatOptions({ adapter }),
          messages: [{ role: 'user', content: 'say hello' }],
        })) {
          if (chunk.type === 'RUN_ERROR') {
            code = chunk.code
            errorType = chunk.metadata?.tanstack?.errorType
          }
        }

        return Response.json({ code, errorType })
      },
    },
  },
})
