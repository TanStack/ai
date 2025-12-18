import { createFileRoute } from '@tanstack/react-router'
import { generateImage, createImageOptions } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'

type Provider = 'openai' | 'gemini'

// Pre-define typed adapter configurations with full type inference
const adapterConfig = {
  gemini: () =>
    createImageOptions({
      adapter: geminiImage('gemini-2.0-flash-preview-image-generation' as any),
    }),
  openai: () =>
    createImageOptions({
      adapter: openaiImage('gpt-image-1' as any),
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
          // Get typed adapter options using createImageOptions pattern
          const options = adapterConfig[provider]()
          const model = options.adapter.model

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
