import { createFileRoute } from '@tanstack/react-router'
import { generateImage } from '@tanstack/ai'
import { openRouterImage } from '@tanstack/ai-openrouter'

export const Route = createFileRoute('/api/image-gen')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, model, size } = body as {
          prompt: string
          model: string
          size?: string
        }

        if (!prompt) {
          return new Response(JSON.stringify({ error: 'Prompt is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const result = await generateImage({
            adapter: openRouterImage(
              (model || 'openai/gpt-5-image-mini') as 'openai/gpt-5-image-mini',
            ),
            prompt,
            ...(size ? { size: size as any } : {}),
          })

          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[Image Gen API] Error:', {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            stack: error?.stack,
          })
          return new Response(
            JSON.stringify({
              error: error.message || 'Image generation failed',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
