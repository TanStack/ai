import { createFileRoute } from '@tanstack/react-router'
import { generateImage, createImageOptions } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'

type Provider = 'openai' | 'gemini'

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, numberOfImages = 1, size = '1024x1024' } = body
        const data = body.data || {}
        const provider: Provider = data.provider || body.provider || 'openai'
        const model: string = data.model || body.model || 'gpt-image-1'

        try {
          // Pre-define typed adapter configurations with full type inference
          // Model is passed to the adapter factory function for type-safe autocomplete
          const adapterConfig = {
            gemini: () =>
              createImageOptions({
                adapter: geminiImage(
                  (model || 'gemini-2.0-flash-preview-image-generation') as any,
                ),
              }),
            openai: () =>
              createImageOptions({
                adapter: openaiImage((model || 'gpt-image-1') as any),
              }),
          }

          // Get typed adapter options using createImageOptions pattern
          const options = adapterConfig[provider]()

          console.log(
            `>> image generation with model: ${model} on provider: ${provider}`,
          )

          const result = await generateImage({
            ...options,
            prompt,
            numberOfImages,
            size,
          })

          console.log(
            '>> image generation result:',
            JSON.stringify(result, null, 2),
          )

          return new Response(
            JSON.stringify({
              images: result.images,
              provider,
              model,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          console.error('[API Route] Error in image generation request:', error)
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
