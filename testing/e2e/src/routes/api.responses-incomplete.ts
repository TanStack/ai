import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Streams one OpenAI Responses chat against the stub server the spec passes in
 * `baseURL`. aimock reports a capped response as `response.completed`, so the
 * spec serves a real `response.incomplete` event itself (issue #1916). Returns
 * the terminal chunk `chat()` yields and what the middleware hooks saw.
 */
export const Route = createFileRoute('/api/responses-incomplete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { baseURL } = (await request.json()) as { baseURL: string }
        const adapter = createOpenaiChat('gpt-4.1-nano', DUMMY_KEY, { baseURL })

        const hooks: Array<string> = []
        const usage: Array<unknown> = []
        let terminal: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
            threadId: 'responses-incomplete',
            adapter,
            modelOptions: { max_output_tokens: 16 },
            messages: [{ role: 'user', content: 'Count from 1 to 300.' }],
            middleware: [
              {
                name: 'probe',
                onUsage: (_ctx, info) => {
                  usage.push(info)
                },
                onFinish: (_ctx, info) => {
                  hooks.push(`onFinish:${info.finishReason}`)
                },
                onError: () => {
                  hooks.push('onError')
                },
              },
            ],
          })) {
            if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
              terminal = { type: chunk.type, usage: chunk.usage }
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, terminal, hooks, usage })
      },
    },
  },
})
