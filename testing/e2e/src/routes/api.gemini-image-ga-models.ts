import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createGeminiImage, GeminiImageModels } from '@tanstack/ai-gemini'
import type { ImageGenerationResult } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
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
 * Runs the two model calls as independent stages (each with its own
 * try/catch) so a regression in one doesn't mask the other — the two specs
 * each assert on only their own stage's result.
 *
 * 1. `gaModel`: `gemini-3.1-flash-image` — the GA id for "Nano Banana 2" —
 *    must be listed in the package's exported `GeminiImageModels` runtime
 *    array and must actually route a `generateImage()` call through
 *    Gemini's `generateContent` API to a returned image. Before the fix,
 *    only the shut-down `-preview` id was in that list (the GA id 404s
 *    against the real API otherwise). `GeminiImageModels` is genuine
 *    runtime data (an exported `as const` array), unlike the per-model
 *    `size` typing below, so `.includes()` on it is real, revert-detectable
 *    coverage independent of any TypeScript compile step — nothing in the
 *    adapter's routing logic gates on this array at runtime, so it's the
 *    only way to observe the id addition without a type-checker.
 * 2. `legacyModel`: `gemini-2.5-flash-image` must send
 *    `generationConfig.imageConfig` with only `aspectRatio` set — no
 *    `imageSize` — because Google documents no `image_size` value for this
 *    model. `parseNativeImageSize`'s regex used to require an
 *    `_<resolution>` suffix on every size string, so a bare ratio like
 *    `"16:9"` failed to match at all pre-fix and no `imageConfig` (not even
 *    `aspectRatio`) reached the wire. The `geminiNativeImageMount` in
 *    `global-setup.ts` 400s unless `aspectRatio` is present and `imageSize`
 *    is absent, so this is genuine runtime proof of the parser change, not
 *    just a type check.
 *
 * Both models are proxied through `geminiNativeImageMount` (global-setup.ts)
 * — aimock's own Gemini `generateContent` handler has no image-response
 * branch (see that mount's doc comment for why).
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
            adapter: createGeminiImage('gemini-3.1-flash-image', DUMMY_KEY, {
              httpOptions: { baseUrl: LLMOCK_DEFAULT_BASE },
            }),
            prompt: 'a guitar in a music store',
            size: '16:9_2K',
          }),
        )

        const legacyModel = await runStage(() =>
          generateImage({
            adapter: createGeminiImage('gemini-2.5-flash-image', DUMMY_KEY, {
              httpOptions: { baseUrl: LLMOCK_DEFAULT_BASE },
            }),
            prompt: 'a guitar in a music store',
            // Bare aspect ratio, no `_<resolution>` suffix — the shape
            // `gemini-2.5-flash-image` requires post-#1104.
            size: '16:9',
          }),
        )

        return new Response(
          JSON.stringify({ gaModelListed, gaModel, legacyModel }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
