import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'

/**
 * Sends a tool whose schema has a property named `__proto__` and returns the
 * request body. The injected `fetch` answers 400, so the run stops after one
 * request.
 */
export const Route = createFileRoute('/api/own-key-schema-wire')({
  server: {
    handlers: {
      POST: async () => {
        let body: unknown
        const adapter = createOpenaiChatCompletions(
          'gpt-5.5',
          'sk-e2e-test-dummy-key',
          {
            maxRetries: 0,
            fetch: async (_input, init) => {
              body = JSON.parse(String(init?.body))
              return Response.json(
                { error: { message: 'stop' } },
                { status: 400 },
              )
            },
          },
        )
        try {
          for await (const _ of chat({
            threadId: 'own-key-schema-wire',
            adapter,
            messages: [{ role: 'user', content: 'Inspect it.' }],
            debug: false,
            tools: [
              {
                name: 'inspect',
                description: 'Inspect a value',
                inputSchema: JSON.parse(
                  '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":"string"}},"required":["__proto__"]}',
                ),
              },
            ],
          })) {
            // Drain the stream.
          }
        } catch {
          // The 400 ends the run. Only the request body matters.
        }
        return Response.json({ body })
      },
    },
  },
})
