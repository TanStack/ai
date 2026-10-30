import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOllamaChat } from '@tanstack/ai-ollama'

export const Route = createFileRoute('/api/ollama-finish-reason')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const toolCall = params.get('tool') === 'true'
        const doneReason = params.get('reason') ?? 'length'
        let requests = 0
        let executions = 0
        const events = []
        // Provider-free wire fixture: exercise the real Ollama SDK's NDJSON parser.
        for await (const event of chat({
          threadId: 'ollama-finish-reason',
          adapter: createOllamaChat('llama3.2', 'http://ollama.test'),
          messages: [{ role: 'user', content: 'Reply' }],
          modelOptions: { model: 'llama3.2', options: { num_predict: 5 } },
          debug: false,
          wrapFetch: () => async () => {
            requests++
            const lines = [
              {
                message: {
                  role: 'assistant',
                  content: 'Partial answer',
                  ...(toolCall &&
                    requests === 1 && {
                      tool_calls: [
                        { function: { name: 'lookup', arguments: {} } },
                      ],
                    }),
                },
                done: false,
              },
              {
                message: { role: 'assistant', content: '' },
                done: true,
                done_reason: doneReason,
              },
            ]
            return new Response(
              lines.map((line) => JSON.stringify(line) + '\n').join(''),
              {
                headers: { 'content-type': 'application/x-ndjson' },
              },
            )
          },
          tools: [
            {
              name: 'lookup',
              description: 'Look up an item',
              execute: () => {
                executions++
                return 'result'
              },
            },
          ],
        }))
          events.push(event)
        return Response.json({ events, requests, executions })
      },
    },
  },
})
