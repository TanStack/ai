import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createGeminiImage, GeminiImageModels } from '@tanstack/ai-gemini'
import type { ImageGenerationResult } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const IMAGE_BASE = `${LLMOCK_DEFAULT_BASE}/gemini-image`
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

interface StageResult {
  imageCount?: number
  error?: string
}

async function runStage(
  generate: () => Promise<ImageGenerationResult>,
): Promise<StageResult> {
  try {
    const result = await generate()
    return { imageCount: result.images.length }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Regression coverage for #1104 (GA image model ids + per-model sizes).
 *
 * Runs each model call as an independent stage (each with its own
 * try/catch) so a regression in one doesn't mask another — each spec
 * asserts on only its own stage's result.
 *
 * 1. `gaModel`: `gemini-3.1-flash-image` — the GA id for "Nano Banana 2" —
 *    must be listed in the package's exported `GeminiImageModels` runtime
 *    array and must actually route a `generateImage()` call through
 *    the Interactions API to a returned image. Before the fix,
 *    only the shut-down `-preview` id was in that list (the GA id 404s
 *    against the real API otherwise). `GeminiImageModels` is genuine
 *    runtime data (an exported `as const` array), unlike the per-model
 *    `size` typing below, so `.includes()` on it is real, revert-detectable
 *    coverage independent of any TypeScript compile step — nothing in the
 *    adapter's routing logic gates on this array at runtime, so it's the
 *    only way to observe the id addition without a type-checker.
 *
 * All models are proxied through `geminiNativeImageMount` (global-setup.ts)
 * on the `/gemini-image` prefix. aimock's own `/v1beta/interactions` handler
 * streams text and has no image branch (see that mount's doc comment).
 */
export const Route = createFileRoute('/api/gemini-image-ga-models')({
  server: {
    handlers: {
      POST: async () => {
        const gaModelListed = GeminiImageModels.includes(
          'gemini-3.1-flash-image',
        )

        const gaModel = await runStage(() =>
          generateImage({
            threadId: 'gemini-image-ga-models',
            adapter: createGeminiImage('gemini-3.1-flash-image', DUMMY_KEY, {
              httpOptions: { baseUrl: IMAGE_BASE },
            }),
            prompt: 'a guitar in a music store',
            size: '16:9_2K',
          }),
        )

        // #1640: `gemini-nano-banana-2.1` is a native image model only
        // because it is in `GEMINI_NATIVE_IMAGE_MODELS`. Otherwise it goes
        // to the Imagen endpoint, which the mock does not serve.
        const nanoBanana21 = await runStage(() =>
          generateImage({
            threadId: 'gemini-image-ga-models',
            adapter: createGeminiImage('gemini-nano-banana-2.1', DUMMY_KEY, {
              httpOptions: { baseUrl: IMAGE_BASE },
            }),
            prompt: 'a guitar in a music store',
            size: '16:9_2K',
          }),
        )

        return new Response(
          JSON.stringify({ gaModelListed, gaModel, nanoBanana21 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
