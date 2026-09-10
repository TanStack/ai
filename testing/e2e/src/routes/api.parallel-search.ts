import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChat, OPENAI_CHAT_MODELS } from '@tanstack/ai-openai'
import { parallelSearchTool } from '@tanstack/ai-parallel'
import type { StreamChunk } from '@tanstack/ai'

export const Route = createFileRoute('/api/parallel-search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId =
          new URL(request.url).searchParams.get('testId') ?? undefined
        const providerRequests: Array<unknown> = []
        const adapter = createOpenaiChat(
          OPENAI_CHAT_MODELS[0],
          'sk-e2e-test-dummy-key',
          {
            baseURL: `${process.env.LLMOCK_URL || 'http://127.0.0.1:4010'}/v1`,
            defaultHeaders: testId ? { 'X-Test-Id': testId } : undefined,
            // Capture per request: other specs can clear aimock's shared journal.
            fetch: async (input, init) => {
              const sent = new Request(input, init)
              providerRequests.push(await sent.clone().json())
              return fetch(sent)
            },
          },
        )
        const searchRequests: Array<{
          url: string
          method: string
          body: unknown
        }> = []

        // Only the Search transport is synthetic. The tool, SDK, chat loop,
        // and provider adapter run unchanged, with aimock handling the model.
        const search = parallelSearchTool({
          apiKey: 'parallel-e2e-dummy-key',
          baseURL: 'https://parallel-search.invalid',
          mode: 'fast',
          defaultMaxResults: 1,
          sourcePolicy: { include_domains: ['example.com'] },
          fetch: async (input, init) => {
            const sent = new Request(input, init)
            searchRequests.push({
              url: sent.url,
              method: sent.method,
              body: await sent.json(),
            })
            return Response.json({
              search_id: 'search_e2e',
              session_id: 'session_e2e',
              results: [
                {
                  url: 'https://example.com/parallel-search',
                  title: 'Parallel Search test source',
                  excerpts: [
                    'Search results include source URLs and excerpts.',
                  ],
                  publish_date: '2026-01-01',
                },
              ],
            })
          },
        })

        const chunks: Array<StreamChunk> = []
        for await (const chunk of chat({
          adapter,
          tools: [search],
          messages: [
            {
              role: 'user',
              content: '[parallel-search] find a source about search results',
            },
          ],
        })) {
          chunks.push(chunk)
        }

        return Response.json({ chunks, searchRequests, providerRequests })
      },
    },
  },
})
