import { createFileRoute } from '@tanstack/react-router'
import { ai } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { openaiImage } from '@tanstack/ai-openai'

type Provider = 'openai' | 'gemini'

const adapters = {
  gemini: () => geminiImage(),
  openai: () => openaiImage(),
}

const models = {
  gemini: 'gemini-2.0-flash-preview-image-generation',
  openai: 'gpt-image-1',
} as const

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, numberOfImages = 1, size = '1024x1024' } = body
        const provider: Provider = body.provider || 'openai'

        try {
          const adapter = adapters[provider]()
          const model = models[provider]

          console.log(
            `>> image generation with model: ${model} on provider: ${provider}`,
          )

          const result = await ai({
            adapter,
            model,
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
