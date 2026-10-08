import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import { z } from 'zod'

export const Route = createFileRoute('/api/openai-malformed-tool-arguments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const withFinishReason =
          new URL(request.url).searchParams.get('terminal') !== 'false'
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
        const adapter = createOpenaiChatCompletions(
          'gpt-5.5',
          'sk-e2e-dummy-key',
          {
            maxRetries: 0,
            fetch: async (input, init) => {
              const providerRequest =
                input instanceof Request ? input : new Request(input, init)
              requests.push(await providerRequest.json())
              const chunk = (
                delta: Record<string, unknown>,
                finish_reason: 'tool_calls' | 'stop' | null = null,
              ) => ({
                id: 'completion-malformed-tool',
                object: 'chat.completion.chunk',
                created: 1,
                model: 'gpt-5.5',
                choices: [{ index: 0, delta, finish_reason }],
              })
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
                    ]
                  : [
                      chunk(
                        { content: 'Recovered from malformed arguments.' },
                        'stop',
                      ),
                    ]
              if (requests.length === 1 && withFinishReason) {
                events.push(chunk({}, 'tool_calls'))
              }
              return new Response(
                events
                  .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                  .join(''),
                { headers: { 'Content-Type': 'text/event-stream' } },
              )
            },
          },
        )

        for await (const chunk of chat({
          adapter,
          messages: [{ role: 'user', content: 'Run the local action' }],
          tools: [tool],
          agentLoopStrategy: maxIterations(2),
          debug: false,
        })) {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') text.push(chunk.delta)
          if (chunk.type === 'RUN_ERROR') runErrors.push(chunk.message)
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
