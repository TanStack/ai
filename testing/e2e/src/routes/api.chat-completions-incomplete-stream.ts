import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/chat-completions-incomplete-stream')(
  {
    server: {
      handlers: {
        POST: async ({ request }) => {
          const scenario = new URL(request.url).searchParams.get('scenario')
          const envelope = {
            id: 'chatcmpl-eof',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'gpt-5.6',
          }
          const chunks: Array<Record<string, unknown>> = [
            {
              ...envelope,
              choices: [
                {
                  index: 0,
                  delta: { content: 'partial' },
                  finish_reason: null,
                },
              ],
            },
          ]
          if (scenario === 'tool') {
            chunks.push({
              ...envelope,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_lookup',
                        type: 'function',
                        function: { name: 'lookup', arguments: '{}' },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })
          }
          const completion = [
            {
              ...envelope,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason:
                    scenario === 'unknown-finish' ? 'error' : 'stop',
                },
              ],
            },
            {
              ...envelope,
              choices: [],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 2,
                total_tokens: 12,
              },
            },
          ]
          let requests = 0
          const adapter = createOpenaiChatCompletions(
            'gpt-5.6',
            'test-placeholder',
            {
              maxRetries: 0,
              fetch: async () => {
                // Finish a follow-up request if a regression executes the tool.
                const complete =
                  scenario === 'complete' ||
                  scenario === 'unknown-finish' ||
                  requests++ > 0
                const payload = complete
                  ? [...chunks.slice(0, 1), ...completion]
                  : chunks
                const body =
                  payload
                    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                    .join('') + (complete ? 'data: [DONE]\n\n' : '')
                return new Response(body, {
                  headers: { 'Content-Type': 'text/event-stream' },
                })
              },
            },
          )
          const result = {
            events: new Array<string>(),
            text: '',
            finishCount: 0,
            errorCount: 0,
            toolCalls: 0,
            totalTokens: 0,
            errorCode: '',
            errorMessage: '',
          }
          for await (const event of chat({
            adapter,
            messages: [{ role: 'user', content: 'Reply' }],
            debug: false,
            tools: [
              {
                name: 'lookup',
                description: 'Look up an item',
                execute: () => {
                  result.toolCalls++
                  return 'result'
                },
              },
            ],
            middleware: [
              {
                name: 'observe',
                onFinish: (_ctx, info) => {
                  result.finishCount++
                  result.totalTokens = info.usage?.totalTokens ?? 0
                },
                onError: () => {
                  result.errorCount++
                },
              },
            ],
          })) {
            result.events.push(event.type)
            if (event.type === 'TEXT_MESSAGE_CONTENT')
              result.text += event.delta
            if (event.type === 'RUN_ERROR') {
              result.errorCode = event.code ?? ''
              result.errorMessage = event.message
            }
          }
          return Response.json(result)
        },
      },
    },
  },
)
