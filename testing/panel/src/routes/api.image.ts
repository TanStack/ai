import { createFileRoute } from '@tanstack/react-router'
import ai from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

type Provider = 'openai' | 'gemini'

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, numberOfImages = 1, size = '1024x1024' } = body
        const provider: Provider = body.provider || 'openai'

        try {
          // Select adapter and model based on provider
          let adapter
          let model

          switch (provider) {
            case 'gemini':
              adapter = geminiImage()
              // Use gemini-2.0-flash which has image generation capability
              // and is more widely available than dedicated Imagen models
              model = 'gemini-2.0-flash-preview-image-generation'
              break
            case 'openai':
            default:
              adapter = openaiImage()
              model = 'gpt-image-1'
              break
          }

          console.log(
            `>> image generation with model: ${model} on provider: ${provider}`,
          )

          const result = await ai({
            adapter: adapter as any,
            model: model as any,
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
