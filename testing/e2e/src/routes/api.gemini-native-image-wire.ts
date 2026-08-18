import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createImageAdapter } from '@/lib/media-providers'

/**
 * Wire-format verification for Gemini-native `modelOptions` on the image
 * generation path (fix/gemini-native-image-model-options).
 *
 * Before that fix, `GeminiImageAdapter`'s `generateWithGeminiApi` only ever
 * forwarded `modelOptions.seed` into the `generateContent` request —
 * `safetySettings`, `thinkingConfig`, `imageConfig`, and `systemInstruction`
 * were silently dropped even though the adapter's provider-options type
 * (`GeminiNativeImageProviderOptions`) already declared them. This route
 * drives `generateImage()` against `gemini-2.5-flash-image` with
 * `modelOptions: { safetySettings, thinkingConfig }` set, hitting
 * `geminiNativeImageMount` in global-setup.ts — a hand-mocked
 * `POST /v1beta/models/gemini-2.5-flash-image:generateContent` endpoint that
 * reads the raw, untranslated request body (aimock's own journal cannot see
 * these fields for this endpoint — see that mount's comment) and rejects
 * with 400 unless `safetySettings` is present at the request root and
 * `generationConfig.thinkingConfig` is present nested, and rejects unless no
 * Imagen-only field (`personGeneration`, `negativePrompt`, a root-level
 * `aspectRatio`, …) is present anywhere in the body.
 *
 * A regression that stops forwarding `modelOptions` on this path — reverting
 * to only `seed`, or reverting to a wholesale `...modelOptions` spread that
 * lets an Imagen field cross over — makes the mount reject the request, the
 * adapter's `client.models.generateContent()` call throws, and this route
 * returns `ok: false`. The companion spec asserts `ok: true`.
 */
export const Route = createFileRoute('/api/gemini-native-image-wire')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createImageAdapter('gemini')

        try {
          const result = await generateImage({
            adapter,
            prompt: 'a guitar in a music store',
            stream: false,
            modelOptions: {
              safetySettings: [
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  threshold: 'BLOCK_ONLY_HIGH',
                },
              ],
              thinkingConfig: { thinkingBudget: 128 },
            },
          })
          return new Response(
            JSON.stringify({ ok: true, images: result.images.length }),
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
        }
      },
    },
  },
})
