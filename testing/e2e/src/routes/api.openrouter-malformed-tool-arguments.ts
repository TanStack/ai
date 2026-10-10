import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import { z } from 'zod'

// OpenRouter ends a tool call cut off by the output limit with
// finish_reason 'tool_calls' (native_finish_reason 'max_output_tokens'),
// then a usage chunk that repeats it, then [DONE].
export const Route = createFileRoute(
  '/api/openrouter-malformed-tool-arguments',
)({
  server: {
    handlers: {
      POST: async () => {
        const requests: Array<unknown> = []
        const executedInputs: Array<unknown> = []
        const text: Array<string> = []
        const runErrors: Array<string> = []
        const tool = toolDefinition({
          name: 'local_action',
          description: 'Record input without side effects',
          inputSchema: z.object({ path: z.string().optional() }),
        }).server((input) => {
          executedInputs.push(input)
          return 'tool ran'
        })
        const chunk = (
          delta: Record<string, unknown>,
          finish_reason: 'tool_calls' | 'stop' | null = null,
          extra: Record<string, unknown> = {},
        ) => ({
          id: 'gen-malformed-tool',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'openai/gpt-4o-mini',
          choices: [
            {
              index: 0,
              delta,
              finish_reason,
              native_finish_reason:
                finish_reason === 'tool_calls' ? 'max_output_tokens' : null,
            },
          ],
          ...extra,
        })
        const usage = {
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }
        const httpClient = new HTTPClient({
          fetcher: async (input, init) => {
            const providerRequest =
              input instanceof Request ? input : new Request(input, init)
            requests.push(await providerRequest.json())
            const events =
              requests.length === 1
                ? [
                    chunk({
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call-malformed',
                          type: 'function',
                          function: {
                            name: 'local_action',
                            arguments: '{"path":',
                          },
                        },
                      ],
                    }),
                    chunk({}, 'tool_calls'),
                    chunk({}, 'tool_calls', usage),
                  ]
                : [
                    chunk({ content: 'Recovered from malformed arguments.' }),
                    chunk({}, 'stop'),
                    chunk({}, 'stop', usage),
                  ]
            return new Response(
              [...events.map((event) => JSON.stringify(event)), '[DONE]']
                .map((data) => `data: ${data}\n\n`)
                .join(''),
              { headers: { 'Content-Type': 'text/event-stream' } },
            )
          },
        })
        const adapter = createOpenRouterText(
          'openai/gpt-4o-mini',
          'sk-e2e-dummy-key',
          { serverURL: 'http://openrouter.test/api/v1', httpClient },
        )

        for await (const event of chat({
          adapter,
          messages: [{ role: 'user', content: 'Run the local action' }],
          tools: [tool],
          agentLoopStrategy: maxIterations(2),
          debug: false,
        })) {
          if (event.type === 'TEXT_MESSAGE_CONTENT') text.push(event.delta)
          if (event.type === 'RUN_ERROR') runErrors.push(event.message)
        }

        return Response.json({
          requests,
          executedInputs,
          text: text.join(''),
          runErrors,
        })
      },
    },
  },
})
