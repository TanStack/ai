import { createFileRoute } from '@tanstack/react-router'
import { chat, summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { createNeonSummarize, createNeonText } from '@tanstack/ai-neon'

// Neon's catalog reports Gemini reasoning_tokens at the root of usage.
// Keep this wire shape independent of aimock's standard OpenAI usage mapper.
export const Route = createFileRoute('/api/neon-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('activity') === 'summarize') {
          const requests: Array<{ url: string; body: unknown }> = []
          const adapter = createNeonSummarize('gpt-6-1-sol', 'test-token', {
            api: 'responses',
            baseURL: process.env.LLMOCK_URL || 'http://127.0.0.1:4010',
            fetch: async (input, init) => {
              const outgoing = new Request(input, init)
              requests.push({
                url: outgoing.url,
                body: await outgoing.clone().json(),
              })
              return fetch(outgoing)
            },
          })
          const options = {
            adapter,
            threadId: 'neon-wire',
            text: '[summarize] The Fender Stratocaster is a versatile electric guitar',
            maxLength: 73,
            modelOptions: { max_output_tokens: 91 },
          }
          let summary = ''
          if (params.get('stream') === 'true') {
            for await (const chunk of summarize({ ...options, stream: true })) {
              if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
              if (chunk.type === 'TEXT_MESSAGE_CONTENT') summary += chunk.delta
            }
          } else {
            summary = (await summarize({ ...options, stream: false })).summary
          }
          return Response.json({ summary, requests })
        }

        const model = 'gemini-3-7-flash'
        const envelope = {
          id: null,
          object: 'chat.completion.chunk',
          created: 1,
          model,
        }
        const chunks = [
          {
            ...envelope,
            choices: [
              {
                index: 0,
                delta: { content: [{ type: 'text', text: 'Hello' }] },
                finish_reason: 'stop',
              },
            ],
          },
          {
            ...envelope,
            choices: [],
            usage: {
              prompt_tokens: 180,
              completion_tokens: 7,
              total_tokens: 459,
              reasoning_tokens: 272,
            },
          },
        ]
        const adapter = createNeonText(model, 'test-token', {
          baseURL: 'https://neon.test',
          fetch: async () =>
            new Response(
              chunks
                .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                .join('') + 'data: [DONE]\n\n',
              { headers: { 'content-type': 'text/event-stream' } },
            ),
        })
        return toServerSentEventsResponse(
          chat({
            adapter,
            messages: [{ role: 'user', content: 'Hello' }],
            threadId: 'neon-wire',
          }),
        )
      },
    },
  },
})
