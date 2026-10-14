import { HTTPClient } from '@openrouter/sdk'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/api/openrouter-structured-usage')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const malformed = params.get('malformed') === 'true'
        const reasoning = params.get('reasoning')
        const envelope = {
          id: 'gen-usage',
          model: 'anthropic/claude-sonnet-4',
          object: 'chat.completion.chunk',
          created: 1,
        }
        const providerEvents = [
          {
            ...envelope,
            choices: [
              {
                index: 0,
                delta: {
                  content: malformed ? '{"answer":' : '{"answer":"ok"}',
                },
                finish_reason: 'stop',
              },
            ],
          },
          {
            ...envelope,
            choices: [],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 50,
              total_tokens: 60,
              cost: 0.002,
              ...(reasoning !== 'missing' && {
                completion_tokens_details: {
                  reasoning_tokens: reasoning === 'zero' ? 0 : 42,
                },
              }),
            },
          },
        ]
        let requests = 0
        const events: Array<unknown> = []
        const usageReports: Array<unknown> = []
        // This model uses structuredOutputStream instead of the combined tools/schema path.
        const adapter = createOpenRouterText(
          'anthropic/claude-sonnet-4',
          'test-key',
          {
            httpClient: new HTTPClient({
              fetcher: async () => {
                requests++
                return new Response(
                  `${providerEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
                  {
                    headers: { 'content-type': 'text/event-stream' },
                  },
                )
              },
            }),
          },
        )
        // Exercise the public promise API: middleware must observe the failed call's usage.
        const result = await chat({
          adapter,
          messages: [{ role: 'user', content: 'Return an answer.' }],
          outputSchema: z.object({ answer: z.string() }),
          middleware: [
            {
              name: 'usage-observer',
              onChunk: (_ctx, chunk) => {
                events.push(chunk)
              },
              onUsage: (_ctx, usage) => {
                usageReports.push(usage)
              },
            },
          ],
        }).then(
          (value) => ({ value }),
          (error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        return Response.json({ result, events, usageReports, requests })
      },
    },
  },
})
