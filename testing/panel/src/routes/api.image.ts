import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
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
          const adapterByProvider = {
            gemini: geminiImage(model as any),
            openai: openaiImage(model as any),
            openrouter: openRouterImage(model as any),
          } as const
          const adapter = adapterByProvider[provider]

          console.log(
            `>> image generation with model: ${model} on provider: ${provider}`,
          )

          const result = await generateImage({
            adapter,
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
