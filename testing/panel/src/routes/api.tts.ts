import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const {
          text,
          voice = 'alloy',
          model = 'tts-1',
          format = 'mp3',
          speed = 1.0,
        } = body

        if (!text || text.trim().length === 0) {
          return new Response(
            JSON.stringify({
              error: 'Text is required',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          const adapter = openaiSpeech(model)

          const result = await generateSpeech({
            adapter,
            text,
            voice,
            format,
            speed,
          })

          return new Response(
            JSON.stringify({
              id: result.id,
              model: result.model,
              audio: result.audio,
              format: result.format,
              contentType: result.contentType,
              duration: result.duration,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
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
