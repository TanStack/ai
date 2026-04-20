import { createFileRoute } from '@tanstack/react-router'
import { generateImage, createImageOptions } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'
import { openRouterImage } from '@tanstack/ai-openrouter'

type Provider = 'openai' | 'gemini' | 'openrouter'

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, numberOfImages = 1, size = '1024x1024' } = body
        const data = body.data || {}
        const provider: Provider = data.provider || body.provider || 'openai'

        const defaultModels: Record<Provider, string> = {
          openai: 'gpt-image-1',
          gemini: 'gemini-2.0-flash-preview-image-generation',
          openrouter: 'google/gemini-3.1-flash-image-preview',
        }
        const model: string =
          data.model || body.model || defaultModels[provider]

        try {
          const adapterConfig = {
            gemini: () =>
              createImageOptions({
                adapter: geminiImage(model as any),
              }),
            openai: () =>
              createImageOptions({
                adapter: openaiImage(model as any),
              }),
            openrouter: () =>
              createImageOptions({
                adapter: openRouterImage(model as any),
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
            `>> image generation complete: ${result.images.length} image(s)`,
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
