import { createServer } from 'node:http'
import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createMistralText } from '@tanstack/ai-mistral'
import { createOllamaChat } from '@tanstack/ai-ollama'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import type { AddressInfo } from 'node:net'

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

/** Answers every request with `body`, for clients that take no custom `fetch`. */
async function withServer<T>(
  body: unknown,
  run: (baseURL: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    )
  } finally {
    server.close()
    server.closeAllConnections()
  }
}

/**
 * `chat({ outputSchema })` on a response that stopped at the output cap
 * (`finish_reason: "length"`). For OpenAI-compatible and OpenRouter,
 * `chat()` takes the adapter's streaming structured-output path. A scripted
 * `fetch` returns a truncated JSON document and, for a reasoning model that
 * spent the budget, empty content. Anthropic, Mistral and Ollama have no
 * streaming structured output, so `chat()` calls their `structuredOutput()`;
 * Mistral and Ollama take no custom `fetch` and get a local server instead.
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

        // A pre-4.5 model takes the forced-tool `structuredOutput()` path
        // (4.5+ use the native combined path). The forced tool call stopped
        // at max_tokens, with partial input.
        const anthropic = createAnthropicChat('claude-opus-4-1', DUMMY_KEY, {
          fetch: async () =>
            Response.json({
              id: 'msg_length',
              type: 'message',
              role: 'assistant',
              model: 'claude-opus-4-1',
              content: [
                {
                  type: 'tool_use',
                  id: 'toolu_length',
                  name: 'structured_output',
                  input: {},
                },
              ],
              stop_reason: 'max_tokens',
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 5 },
            }),
        })
        errors['anthropic-truncated'] = await errorOf(() =>
          chat({
            ...createChatOptions({ adapter: anthropic }),
            messages: [{ role: 'user', content: 'Give me a title' }],
            outputSchema,
          }),
        )

        errors['mistral-truncated'] = await withServer(
          {
            id: 'cmpl-length',
            object: 'chat.completion',
            created: 1,
            model: 'mistral-large-latest',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"title":"cut o' },
                finish_reason: 'length',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          },
          (baseURL) =>
            errorOf(() =>
              chat({
                ...createChatOptions({
                  adapter: createMistralText(
                    'mistral-large-latest',
                    DUMMY_KEY,
                    { baseURL },
                  ),
                }),
                messages: [{ role: 'user', content: 'Give me a title' }],
                outputSchema,
              }),
            ),
        )

        errors['ollama-truncated'] = await withServer(
          {
            model: 'mistral',
            created_at: '2026-01-01T00:00:00Z',
            message: { role: 'assistant', content: '{"title":"cut o' },
            done: true,
            done_reason: 'length',
          },
          (baseURL) =>
            errorOf(() =>
              chat({
                ...createChatOptions({
                  adapter: createOllamaChat('mistral', { baseURL }),
                }),
                messages: [{ role: 'user', content: 'Give me a title' }],
                outputSchema,
              }),
            ),
        )
        return Response.json({ errors })
      },
    },
  },
})
