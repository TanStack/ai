import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createOpenaiImage } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Generates one image on each gpt-image-2.5 model through aimock's native
 * `/v1/images/generations` handler, with a listed size and a 2.5-only
 * quality. The adapter validates the model and size before sending, so an
 * unknown id fails here with "Unknown image model".
 */
export const Route = createFileRoute('/api/openai-image-2-5-models')({
  server: {
    handlers: {
      POST: async () => {
        const results: Record<string, { imageCount?: number; error?: string }> =
          {}
        for (const model of [
          'gpt-image-2.5-flare',
          'gpt-image-2.5-sunburst',
        ] as const) {
          try {
            const result = await generateImage({
              adapter: createOpenaiImage(model, DUMMY_KEY, {
                baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
              }),
              prompt: 'a guitar in a music store',
              size: '1536x1024',
              modelOptions: { quality: 'max' },
            })
            results[model] = { imageCount: result.images.length }
          } catch (error) {
            results[model] = {
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
