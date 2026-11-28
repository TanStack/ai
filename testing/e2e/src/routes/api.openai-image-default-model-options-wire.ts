import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createOpenaiImage } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenAI image adapter with `defaultModelOptions` that set
 * `quality` and `background`. The route calls `generateImage()` two times:
 * first with no `modelOptions`, then with a call `quality` that replaces
 * the default. The companion spec reads aimock's request journal to check
 * which options went on the wire for each call.
 */
export const Route = createFileRoute(
  '/api/openai-image-default-model-options-wire',
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId =
          new URL(request.url).searchParams.get('testId') ?? undefined

        const adapter = createOpenaiImage('gpt-image-2.6-flare', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          ...(testId ? { defaultHeaders: { 'X-Test-Id': testId } } : {}),
          defaultModelOptions: { quality: 'low', background: 'opaque' },
        })
        const prompt = '[default-model-options-wire] a red kite'

        try {
          await generateImage({
            threadId: 'openai-image-default-model-options-wire',
            adapter,
            prompt,
          })
          await generateImage({
            threadId: 'openai-image-default-model-options-wire',
            adapter,
            prompt,
            modelOptions: { quality: 'max' },
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true })
      },
    },
  },
})
