import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createHarnessHost,
  defineHarness,
  retryTransientErrors,
} from '@tanstack/ai-harness'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Drives one harness turn against an aimock fixture. The first request gets a
 * 429 with `Retry-After: 1`. The second request gets the answer. The backoff
 * is 60 seconds, so only the `retryAfterMs` of the error makes the turn
 * retry in time. The route returns the text, the `retryAfterMs` that the
 * hook saw, and how long the turn waited.
 */
export const Route = createFileRoute('/api/harness-retry-after')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId')
        const policy = retryTransientErrors({ baseDelayMs: 60_000 })
        const seen: Array<number | undefined> = []
        const host = createHarnessHost()
        const started = Date.now()
        try {
          const session = await host.open(
            defineHarness({
              name: 'e2e/harness-retry-after',
              adapter: createAnthropicChat('claude-sonnet-5-5', DUMMY_KEY, {
                baseURL: LLMOCK_DEFAULT_BASE,
                // The SDK must not retry the 429 itself.
                maxRetries: 0,
                ...(testId ? { defaultHeaders: { 'X-Test-Id': testId } } : {}),
              }),
              turn: {
                onModelError: (ctx) => {
                  seen.push(ctx.error.retryAfterMs)
                  return policy(ctx)
                },
              },
            }),
            { threadId: 'e2e-harness-retry-after' },
          )
          const { text } = await session.prompt(
            '[harness-retry-after] say hello',
          )
          return Response.json({
            text,
            retryAfterMs: seen,
            waitedMs: Date.now() - started,
          })
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await host.close()
        }
      },
    },
  },
})
