import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { createImageAdapter } from '@/lib/media-providers'

/**
 * Wire-format verification for Gemini-native image `modelOptions`.
 *
 * `geminiNativeImageMount` reads the Interactions request and 400s unless
 * `safety_settings` is `[{ type: "dangerous_content", threshold:
 * "block_only_high" }]`, `generation_config.thinking_level` is `"low"`, and
 * no Imagen or generateContent field is present. A second call chains
 * `previous_interaction_id` from the first result and must not resend an
 * image. The mount answers `int_e2e_create` then `int_e2e_edit`.
 *
 * A dropped `modelOptions` field, a `thinkingBudget` that is sent instead of
 * `thinkingLevel`, or a chained turn that re-sends the image makes the mount
 * reject the request and this route returns `ok: false`.
 */
export const Route = createFileRoute('/api/gemini-native-image-wire')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createImageAdapter('gemini')

        try {
          const first = await generateImage({
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
              thinkingConfig: { thinkingLevel: 'LOW' },
            },
          })
          const edit = await generateImage({
            adapter,
            prompt: 'Make the guitar red',
            stream: false,
            modelOptions: { previous_interaction_id: first.id },
          })
          return new Response(
            JSON.stringify({
              ok: true,
              images: first.images.length,
              editImages: edit.images.length,
              firstId: first.id,
              editId: edit.id,
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
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
