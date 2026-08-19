import { createFileRoute } from '@tanstack/react-router'
import { generateVideo } from '@tanstack/ai'
import { createBytePlusVideo } from '@tanstack/ai-byteplus'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Regression coverage for #1146 (Seedance 2.5 native 1080p).
 *
 * Before that change the BytePlus adapter's per-model table listed
 * `dreamina-seedance-2-5-260628` as 480p/720p only, so `size: '16:9_1080p'`
 * threw locally and never reached Ark. This route drives `generateVideo()`
 * against that model with 1080p, hitting `byteplusSeedanceMount` in
 * `global-setup.ts`. A wrap around `fetch` records the create-task body so
 * the spec can assert `resolution: '1080p'` crossed the wire — not just that
 * the call didn't throw.
 */
export const Route = createFileRoute('/api/byteplus-seedance-1080p-wire')({
  server: {
    handlers: {
      POST: async () => {
        let captured: { resolution?: string; model?: string } | undefined
        const adapter = createBytePlusVideo(
          'dreamina-seedance-2-5-260628',
          DUMMY_KEY,
          {
            baseURL: `${LLMOCK_DEFAULT_BASE}/api/v3`,
            fetch: async (input, init) => {
              if (typeof init?.body === 'string') {
                try {
                  const body = JSON.parse(init.body) as {
                    resolution?: string
                    model?: string
                  }
                  if (body.model !== undefined) captured = body
                } catch {
                  // Non-JSON bodies (poll GETs have none) are ignored.
                }
              }
              return fetch(input, init)
            },
          },
        )

        try {
          const result = await generateVideo({
            adapter,
            prompt: 'a guitar being played in a store',
            size: '16:9_1080p',
          })
          return new Response(
            JSON.stringify({
              ok: true,
              jobId: result.jobId,
              model: captured?.model,
              resolution: captured?.resolution,
            }),
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
              model: captured?.model,
              resolution: captured?.resolution,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
