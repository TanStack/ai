import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/** fal hardcodes its queue endpoint; we redirect these to the aimock mount. */
const FAL_QUEUE_PREFIX = 'https://queue.fal.run/'

/**
 * Drives the fal image adapter against the `/fal-queue` aimock mount, which
 * stamps `x-fal-billable-units` on the result fetch. The companion spec asserts
 * those units reach `result.usage.unitsBilled` — proving the adapter's
 * `config.fetch` billing capture forwards fal's real billed quantity.
 *
 * fal's queue URLs are not configurable, so the handler temporarily redirects
 * `queue.fal.run` requests to the mock by swapping `globalThis.fetch` (the
 * adapter's billing fetch resolves the global per call, so the swap is honoured).
 * Non-fal requests pass through untouched and the original fetch is restored in
 * `finally`.
 */
export const Route = createFileRoute('/api/fal-billable-units')({
  server: {
    handlers: {
      POST: async () => {
        const mockBase = `${LLMOCK_DEFAULT_BASE}/fal-queue/`
        const originalFetch = globalThis.fetch
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url
          if (url.startsWith(FAL_QUEUE_PREFIX)) {
            return originalFetch(
              mockBase + url.slice(FAL_QUEUE_PREFIX.length),
              init,
            )
          }
          return originalFetch(input, init)
        }) as typeof fetch

        try {
          const adapter = falImage('fal-ai/flux/dev', {
            apiKey: 'fal-e2e-dummy',
          })
          const result = await generateImage({
            adapter,
            prompt: 'a billed image',
          })
          return new Response(
            JSON.stringify({ ok: true, usage: result.usage }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        } finally {
          globalThis.fetch = originalFetch
        }
      },
    },
  },
})
