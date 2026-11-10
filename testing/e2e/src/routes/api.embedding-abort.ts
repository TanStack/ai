import { createFileRoute } from '@tanstack/react-router'
import { embed } from '@tanstack/ai'
import { createOpenaiEmbedding } from '@tanstack/ai-openai'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Calls `embed({ timeout })` against a mount that never answers, then asks the
 * mount whether the client closed the HTTP request. A closed request proves
 * the timeout signal reached the provider fetch.
 */
export const Route = createFileRoute('/api/embedding-abort')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId') ?? ''
        const base = `${LLMOCK_BASE}/embedding-abort`
        let errorName: string | undefined
        try {
          await embed({
            adapter: createOpenaiEmbedding(
              'text-embedding-3-small',
              DUMMY_KEY,
              {
                baseURL: `${base}/v1`,
                defaultHeaders: { 'X-Test-Id': testId },
                maxRetries: 0,
              },
            ),
            input: 'a red guitar',
            timeout: 300,
          })
        } catch (error) {
          errorName = error instanceof Error ? error.name : String(error)
        }

        // The socket close can land just after the rejection. Poll briefly.
        let closedByClient = false
        for (let i = 0; i < 20 && !closedByClient; i++) {
          const status = await fetch(
            `${base}/status?testId=${encodeURIComponent(testId)}`,
          )
          const body: unknown = await status.json()
          closedByClient =
            typeof body === 'object' &&
            body !== null &&
            'closedByClient' in body &&
            body.closedByClient === true
          if (!closedByClient) await new Promise((r) => setTimeout(r, 50))
        }

        return Response.json({ errorName, closedByClient })
      },
    },
  },
})
