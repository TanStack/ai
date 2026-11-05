import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const model = 'claude-haiku-4-5'

const sse = (events: Array<Record<string, unknown> & { type: string }>) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

export const Route = createFileRoute('/api/anthropic-incomplete-stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const complete =
          new URL(request.url).searchParams.get('scenario') === 'complete'
        const events = [
          {
            type: 'message_start',
            message: {
              id: 'msg_eof',
              type: 'message',
              role: 'assistant',
              model,
              content: [],
              stop_reason: null,
              usage: { input_tokens: 10, output_tokens: 1 },
            },
          },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'partial' },
          },
          // The connection drops here unless the scenario is `complete`.
          ...(complete
            ? [
                { type: 'content_block_stop', index: 0 },
                {
                  type: 'message_delta',
                  delta: { stop_reason: 'end_turn' },
                  usage: { output_tokens: 2 },
                },
                { type: 'message_stop' },
              ]
            : []),
        ]
        const adapter = createAnthropicChat(model, 'test-placeholder', {
          maxRetries: 0,
          fetch: async () =>
            new Response(sse(events), {
              headers: { 'Content-Type': 'text/event-stream' },
            }),
        })
        const result = {
          events: new Array<string>(),
          text: '',
          finishCount: 0,
          errorCount: 0,
          errorCode: '',
        }
        for await (const event of chat({
          threadId: 'anthropic-incomplete-stream',
          adapter,
          messages: [{ role: 'user', content: 'Reply' }],
          debug: false,
          middleware: [
            {
              name: 'observe',
              onFinish: () => {
                result.finishCount++
              },
              onError: () => {
                result.errorCount++
              },
            },
          ],
        })) {
          result.events.push(event.type)
          if (event.type === 'TEXT_MESSAGE_CONTENT') result.text += event.delta
          if (event.type === 'RUN_ERROR') result.errorCode = event.code ?? ''
        }
        return Response.json(result)
      },
    },
  },
})
