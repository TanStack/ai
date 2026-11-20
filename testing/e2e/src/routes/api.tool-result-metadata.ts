import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'

/**
 * Server half of the tool result metadata harness. The page is
 * `tool-result-metadata.tsx`.
 *
 * - POST runs `chat()` against aimock (fixtures in
 *   `fixtures/tool-result-metadata/`). The `search_docs` server tool sets
 *   `sources` as result metadata. The model gets only the tool output.
 * - GET is the `persistence: true` mount hydrate. It reads the
 *   `withPersistence` transcript through `reconstructChat`, so a reload shows
 *   the sources again.
 */

const persistence = memoryPersistence()

const searchDocs = toolDefinition({
  name: 'search_docs',
  description: 'Search the docs',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  resultMetadataSchema: z.object({
    sources: z.array(
      z.object({ id: z.string(), title: z.string(), url: z.string() }),
    ),
  }),
}).server(async (_args, context) => {
  context?.setResultMetadata?.({
    sources: [
      {
        id: 'src-lighthouse',
        title: 'Lighthouse guide',
        url: 'https://docs.example.com/lighthouse',
      },
      {
        id: 'src-keeper',
        title: 'Keeper log',
        url: 'https://docs.example.com/keeper-log',
      },
    ],
  })
  return { answer: 'LIGHTHOUSE_ANSWER the lamp turns every ten seconds.' }
})

export const Route = createFileRoute('/api/tool-result-metadata')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        const fp = params.forwardedProps
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        return toServerSentEventsResponse(
          chat({
            ...createTextAdapter('openai', undefined, aimockPort, testId),
            messages: params.messages,
            tools: [searchDocs],
            threadId: params.threadId,
            runId: params.runId,
            middleware: [withPersistence(persistence)],
          }),
        )
      },

      GET: ({ request }) =>
        reconstructChat(persistence, request, {
          authorize: (threadId) => threadId.length > 0,
        }),
    },
  },
})
