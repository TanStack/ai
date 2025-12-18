import { createFileRoute } from '@tanstack/react-router'
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/transcription')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData()
        const audioFile = formData.get('audio') as File | null
        const audioBase64 = formData.get('audioBase64') as string | null
        const model = (formData.get('model') as string) || 'whisper-1'
        const language = formData.get('language') as string | null
        const responseFormat = formData.get('responseFormat') as string | null

        if (!audioFile && !audioBase64) {
          return new Response(
            JSON.stringify({
              error: 'Audio file or base64 data is required',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          const adapter = openaiTranscription(model)

          // Prepare audio data
          let audioData: string | File
          if (audioFile) {
            audioData = audioFile
          } else if (audioBase64) {
            audioData = audioBase64
          } else {
            throw new Error('No audio data provided')
          }

          const result = await generateTranscription({
            adapter,
            audio: audioData,
            language: language || undefined,
            responseFormat: (responseFormat as any) || 'verbose_json',
          })

          return new Response(
            JSON.stringify({
              id: result.id,
              model: result.model,
              text: result.text,
              language: result.language,
              duration: result.duration,
              segments: result.segments,
              words: result.words,
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
