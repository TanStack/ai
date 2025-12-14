import { createFileRoute } from '@tanstack/react-router'
import { ai, createOptions } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'

type Provider = 'openai' | 'gemini'

// Pre-define typed adapter configurations with full type inference
const adapterConfig = {
  gemini: () =>
    createOptions({
      adapter: geminiImage(),
      // Use gemini-2.0-flash which has image generation capability
      // and is more widely available than dedicated Imagen models
      model: 'gemini-2.0-flash-preview-image-generation',
    }),
  openai: () =>
    createOptions({
      adapter: openaiImage(),
      model: 'gpt-image-1',
    }),
}

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, numberOfImages = 1, size = '1024x1024' } = body
        const provider: Provider = body.provider || 'openai'

        try {
          // Get typed adapter options using createOptions pattern
          const options = adapterConfig[provider]()

          console.log(
            `>> image generation with model: ${options.model} on provider: ${provider}`,
          )

          const result = await ai({
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
              model: options.model,
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
