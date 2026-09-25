import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/** A streamed chat completion that stops at the output cap. */
function lengthResponse(content: string): Response {
  const chunk = (delta: Record<string, unknown>, finishReason: string | null) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-length',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gpt-4o',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`
  const body =
    (content ? chunk({ role: 'assistant', content }, null) : '') +
    chunk({}, 'length') +
    'data: [DONE]\n\n'
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const outputSchema = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
}

async function errorOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * `chat({ outputSchema })` on a response that stopped at the output cap
 * (`finish_reason: "length"`). `chat()` takes the adapter's streaming
 * structured-output path. A scripted `fetch` returns a truncated JSON
 * document and, for a reasoning model that spent the budget, empty content.
 * The companion spec checks that each adapter reports the token limit
 * instead of a JSON parse or empty-content error. No aimock fixture is used.
 */
export const Route = createFileRoute('/api/structured-output-length-wire')({
  server: {
    handlers: {
      POST: async () => {
        const errors: Record<string, string | null> = {}
        for (const [label, content] of [
          ['truncated', '{"title":"cut o'],
          ['empty', ''],
        ] as const) {
          const compatible = openaiCompatible({
            name: 'custom-compatible',
            baseURL: 'http://127.0.0.1:1/v1',
            apiKey: DUMMY_KEY,
            models: ['gpt-4o'],
            maxRetries: 0,
            fetch: async () => lengthResponse(content),
          })
          errors[`compatible-${label}`] = await errorOf(() =>
            chat({
              ...createChatOptions({ adapter: compatible('gpt-4o') }),
              messages: [{ role: 'user', content: 'Give me a title' }],
              outputSchema,
            }),
          )

          const openRouter = createOpenRouterText('openai/gpt-4o', DUMMY_KEY, {
            httpClient: new HTTPClient({
              fetcher: async () => lengthResponse(content),
            }),
          })
          errors[`openrouter-${label}`] = await errorOf(() =>
            chat({
              ...createChatOptions({ adapter: openRouter }),
              messages: [{ role: 'user', content: 'Give me a title' }],
              outputSchema,
            }),
          )
        }
        return Response.json({ errors })
      },
    },
  },
})
